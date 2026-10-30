import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';

import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret?.trim() || Buffer.byteLength(secret, 'utf8') < 32) {
          throw new Error('JWT_SECRET 未配置或长度不足 32 字节');
        }

        return {
          secret,
          signOptions: {
            algorithm: 'HS256',
            expiresIn: '30m',
            issuer: 'workflow-system',
            audience: 'workflow-api',
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
