import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';

import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.usersService.findByEmailForLogin(dto.email);
    const invalidCredentials = () =>
      new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '邮箱或密码不正确',
      });

    if (!user || !user.isActive || !user.passwordHash) {
      throw invalidCredentials();
    }

    let passwordMatches: boolean;
    try {
      passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    } catch {
      // 旧账号或损坏的哈希同样不能通过认证。
      throw invalidCredentials();
    }

    if (!passwordMatches) {
      throw invalidCredentials();
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
    });

    return { access_token: accessToken };
  }
}
