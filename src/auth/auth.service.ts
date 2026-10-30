import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service';
import { ACCESS_TOKEN_TTL_SECONDS } from './auth.constants';
import { LoginDto } from './dto/login.dto';

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<LoginResponse> {
    const user = await this.usersService.findByEmailForLogin(dto.email);

    if (!user || !user.passwordHash) {
      this.throwInvalidCredentials();
    }

    let passwordMatches: boolean;
    try {
      passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      // 旧账号或损坏的哈希同样不能通过认证。
      this.throwInvalidCredentials();
    }

    if (!passwordMatches || !user.isActive) {
      this.throwInvalidCredentials();
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private throwInvalidCredentials(): never {
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: '邮箱或密码错误',
    });
  }
}
