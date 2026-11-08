import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { JsonWebTokenError, JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

import { UsersService } from '../users/users.service';
import type { CurrentUserData } from './current-user-data.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: CurrentUserData }>();
    const authorization = request.headers.authorization;
    const match =
      typeof authorization === 'string'
        ? /^Bearer\s+(\S+)$/i.exec(authorization)
        : null;

    if (!match) {
      throw this.unauthorized();
    }

    let payload: Record<string, unknown>;
    try {
      payload = await this.jwtService.verifyAsync<Record<string, unknown>>(
        match[1],
        {
          algorithms: ['HS256'],
          issuer: 'workflow-system',
          audience: 'workflow-api',
          ignoreExpiration: false,
          ignoreNotBefore: false,
        },
      );
    } catch (error) {
      if (error instanceof JsonWebTokenError) {
        throw this.unauthorized();
      }
      throw error;
    }

    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string' ||
      !isUUID(payload.sub) ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp)
    ) {
      throw this.unauthorized();
    }

    // 数据库异常应继续传播，不能伪装成认证失败。
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw this.unauthorized();
    }

    request.user = { id: user.id, role: user.role };
    return true;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: '请提供有效的登录凭证',
    });
  }
}
