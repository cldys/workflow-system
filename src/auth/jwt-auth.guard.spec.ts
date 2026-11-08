import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';

import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { CurrentUserData } from './current-user-data.interface';

describe('JwtAuthGuard', () => {
  const id = '550e8400-e29b-41d4-a716-446655440001';
  const jwtService = new JwtService({
    secret: 'guard-tests-only-secret-not-for-production',
  });
  const usersService = { findById: jest.fn() };
  let guard: JwtAuthGuard;
  let request: {
    headers: { authorization?: string };
    user?: CurrentUserData;
  };
  let context: ExecutionContext;

  function sign(
    payload: object = { sub: id },
    options: JwtSignOptions = {},
  ): Promise<string> {
    const signOptions: JwtSignOptions = {
      algorithm: 'HS256',
      expiresIn: '5m',
      issuer: 'workflow-system',
      audience: 'workflow-api',
      ...options,
    };
    for (const key of ['issuer', 'audience', 'expiresIn'] as const) {
      if (signOptions[key] === undefined) delete signOptions[key];
    }
    return jwtService.signAsync(payload, signOptions);
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    usersService.findById.mockResolvedValue({
      id,
      role: 'EMPLOYEE',
      isActive: true,
      passwordHash: 'must-not-be-copied',
    });
    const module = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();
    guard = module.get(JwtAuthGuard);
    request = { headers: {} };
    context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await module.close();
  });

  it.each([
    undefined,
    '',
    'Basic abc',
    'Bearer',
    'Bearer ',
    'Bearer a b',
    'Bearer not-a-token',
  ])(
    'rejects a missing or malformed Bearer header: %p',
    async (authorization) => {
      request.headers.authorization = authorization;
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    },
  );

  it.each([
    [
      'invalid signature',
      {},
      { secret: 'another-tests-only-secret-at-least-32-bytes' },
    ],
    ['expired JWT', {}, { expiresIn: -1 }],
    ['future nbf', {}, { notBefore: '1m' }],
    ['wrong algorithm', {}, { algorithm: 'HS384' }],
    ['unsigned JWT', {}, { algorithm: 'none' }],
    ['wrong issuer', {}, { issuer: 'other-system' }],
    ['missing issuer', {}, { issuer: undefined }],
    ['wrong audience', {}, { audience: 'other-api' }],
    ['missing audience', {}, { audience: undefined }],
    ['missing expiration', {}, { expiresIn: undefined }],
    ['missing sub', { sub: undefined }, {}],
    ['malformed sub', { sub: 'not-a-uuid' }, {}],
    ['non-string sub', { sub: 123 }, {}],
    ['null sub', { sub: null }, {}],
  ] as [string, object, JwtSignOptions][])(
    'rejects %s before querying the database',
    async (_, claims, options) => {
      request.headers.authorization = `Bearer ${await sign({ sub: id, ...claims }, options)}`;

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(usersService.findById).not.toHaveBeenCalled();
      expect(request.user).toBeUndefined();
    },
  );

  it('explicitly verifies constraints and copies only database id and role', async () => {
    // Token 中即使伪造角色，也不能覆盖数据库中的最新值。
    const token = await sign({ sub: id, role: 'APPROVER' });
    request.headers.authorization = `bearer ${token}`;
    const verify = jest.spyOn(jwtService, 'verifyAsync');
    try {
      expect(await guard.canActivate(context)).toBe(true);
      expect(verify).toHaveBeenCalledWith(token, {
        algorithms: ['HS256'],
        issuer: 'workflow-system',
        audience: 'workflow-api',
        ignoreExpiration: false,
        ignoreNotBefore: false,
      });
      expect(usersService.findById).toHaveBeenCalledWith(id);
      expect(request.user).toEqual({ id, role: 'EMPLOYEE' });

      usersService.findById.mockResolvedValueOnce({
        id,
        role: 'APPROVER',
        isActive: true,
      });
      await guard.canActivate(context);
      expect(request.user).toEqual({ id, role: 'APPROVER' });
    } finally {
      verify.mockRestore();
    }
  });

  it.each([
    ['deleted user', null],
    ['inactive user', { id, role: 'EMPLOYEE', isActive: false }],
  ])('rejects a %s', async (_, user) => {
    request.headers.authorization = `Bearer ${await sign()}`;
    usersService.findById.mockResolvedValueOnce(user);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
  });

  it('propagates database errors unchanged', async () => {
    const error = new Error('database connection failed');
    request.headers.authorization = `Bearer ${await sign()}`;
    usersService.findById.mockRejectedValueOnce(error);

    await expect(guard.canActivate(context)).rejects.toBe(error);
    expect(request.user).toBeUndefined();
  });

  it('propagates unexpected JWT service failures unchanged', async () => {
    const error = new Error('secret provider unavailable');
    request.headers.authorization = `Bearer ${await sign()}`;
    const verify = jest
      .spyOn(jwtService, 'verifyAsync')
      .mockRejectedValueOnce(error);
    try {
      await expect(guard.canActivate(context)).rejects.toBe(error);
      expect(usersService.findById).not.toHaveBeenCalled();
    } finally {
      verify.mockRestore();
    }
  });
});
