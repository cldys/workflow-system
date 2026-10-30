import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import request from 'supertest';

import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { UserEntity } from '../users/entities/user.entity';
import { AuthModule } from './auth.module';

describe('AuthController', () => {
  let app: INestApplication;
  let passwordHash: string;
  const secret = 'auth-tests-only-secret-not-for-production';
  const credentials = { email: 'Employee@example.test', password: 'x' };
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  beforeAll(async () => {
    passwordHash = await argon2.hash(credentials.password);
    const module = await Test.createTestingModule({ imports: [AuthModule] })
      .overrideProvider(getRepositoryToken(UserEntity))
      .useValue(repository)
      .overrideProvider(ConfigService)
      .useValue({ getOrThrow: () => secret })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.getOne.mockResolvedValue({
      id: '550e8400-e29b-41d4-a716-446655440000',
      email: credentials.email,
      passwordHash,
      role: 'EMPLOYEE',
      isActive: true,
    });
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('returns a signed, expiring JWT without exposing credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    expect(response.body).toEqual({ access_token: expect.any(String) });
    const payload = await new JwtService({ secret }).verifyAsync(
      response.body.access_token as string,
      { algorithms: ['HS256'] },
    );
    expect(payload).toEqual({
      sub: '550e8400-e29b-41d4-a716-446655440000',
      role: 'EMPLOYEE',
      iat: expect.any(Number),
      exp: expect.any(Number),
    });
    expect(payload.exp - payload.iat).toBe(3600);
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.passwordHash');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'LOWER(user.email) = :email',
      { email: 'employee@example.test' },
    );
  });

  it.each([
    {},
    { email: 123, password: null },
    { email: 'invalid', password: 'x' },
    { email: ' employee@example.test ', password: 'x' },
    { email: `${'a'.repeat(256)}@example.test`, password: 'x' },
    { email: credentials.email },
    { ...credentials, password: null },
    { ...credentials, password: 123 },
    { ...credentials, password: '' },
    { ...credentials, password: 'x'.repeat(1025) },
    { ...credentials, role: 'APPROVER' },
  ])(
    'returns 400 before querying users for invalid input: %p',
    async (body) => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        path: '/auth/login',
      });
      expect(repository.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('returns 401 for an incorrect password', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ ...credentials, password: 'incorrect' })
      .expect(401)
      .expect({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: '邮箱或密码不正确',
        path: '/auth/login',
      });
  });

  it.each([
    null,
    { isActive: false, passwordHash: 'unused' },
    { isActive: true, passwordHash: null },
    { isActive: true, passwordHash: 'invalid-hash' },
  ])('returns the same 401 for an unavailable account: %p', async (user) => {
    queryBuilder.getOne.mockResolvedValueOnce(user);
    const sign = jest.spyOn(app.get(JwtService), 'signAsync');
    try {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(credentials)
        .expect(401)
        .expect({
          statusCode: 401,
          code: 'INVALID_CREDENTIALS',
          message: '邮箱或密码不正确',
          path: '/auth/login',
        });
      expect(sign).not.toHaveBeenCalled();
    } finally {
      sign.mockRestore();
    }
  });

  it.each([undefined, '', '   '])(
    'rejects missing or blank JWT_SECRET: %p',
    async (secretValue) => {
      await expect(
        Test.createTestingModule({ imports: [AuthModule] })
          .overrideProvider(getRepositoryToken(UserEntity))
          .useValue(repository)
          .overrideProvider(ConfigService)
          .useValue({
            getOrThrow: () => {
              if (secretValue === undefined) {
                throw new Error('JWT_SECRET is required');
              }
              return secretValue;
            },
          })
          .compile(),
      ).rejects.toThrow('JWT_SECRET');
    },
  );
});
