import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';

import { CurrentUser } from './current-user.decorator';
import type { CurrentUserData } from './current-user-data.interface';

@Controller('current-user')
class CurrentUserTestController {
  @Get()
  getCurrentUser(@CurrentUser() user: CurrentUserData | undefined) {
    return { user: user ?? null };
  }
}

describe('CurrentUser', () => {
  let app: INestApplication;
  let authenticatedUser: CurrentUserData | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CurrentUserTestController],
    }).compile();
    app = module.createNestApplication();
    app.use(
      (
        req: Request & { user?: CurrentUserData },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = authenticatedUser;
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reads the authenticated user from request.user', async () => {
    authenticatedUser = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      role: 'APPROVER',
    };
    await request(app.getHttpServer())
      .get('/current-user')
      .expect(200)
      .expect({ user: authenticatedUser });
  });

  it('does not derive an identity from headers when request.user is absent', async () => {
    authenticatedUser = undefined;
    await request(app.getHttpServer())
      .get('/current-user')
      .set('Authorization', 'Bearer unverified-token')
      .set('X-Demo-User-Id', '550e8400-e29b-41d4-a716-446655440001')
      .expect(200)
      .expect({ user: null });
  });
});
