import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { DataSource, EntityManager } from 'typeorm';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RequestEventEntity } from '../request-events/entities/request-event.entity';
import { RequestEntity } from './entities/request.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { UserEntity } from '../users/entities/user.entity';

describe('RequestsController', () => {
  let app: INestApplication;
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const createdById = '550e8400-e29b-41d4-a716-446655440001';
  const usersRepository = { findOneBy: jest.fn() };
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };
  const repository = {
    findOneBy: jest.fn(),
    create: jest.fn((data: Partial<RequestEntity>) => data),
    save: jest.fn((data: Partial<RequestEntity>) =>
      Promise.resolve({
        ...data,
        id: 'generated-id',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    ),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const eventsRepository = {
    create: jest.fn((data: Partial<RequestEventEntity>) => data),
    save: jest.fn(),
  };
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === RequestEntity) return repository;
      if (entity === UserEntity) return usersRepository;
      if (entity === RequestEventEntity) return eventsRepository;
      throw new Error('Unexpected entity');
    }),
  };
  const dataSource = {
    transaction: jest.fn((run: (manager: EntityManager) => Promise<unknown>) =>
      run(manager as unknown as EntityManager),
    ),
  };
  const writeRoutes = ['', `/${id}/submit`, `/${id}/approve`, `/${id}/reject`];
  const body = { title: 'Request', reason: 'Reason' };
  const bodyFor = (route: string) =>
    route.endsWith('/reject')
      ? { reason: body.reason }
      : route
        ? {}
        : { title: body.title };

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.findOneBy.mockReset();
    usersRepository.findOneBy.mockResolvedValue({ id: createdById });
    queryBuilder.execute.mockResolvedValue({ affected: 0 });
    const module = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [
        RequestsService,
        { provide: getRepositoryToken(RequestEntity), useValue: repository },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['', '/events', '/submit', '/approve', '/reject'])(
    'returns INVALID_UUID for an invalid request ID on %s',
    async (suffix) => {
      const path = `/requests/not-a-uuid${suffix}`;
      const client = request(app.getHttpServer());
      const operation = ['', '/events'].includes(suffix)
        ? client.get(path)
        : client
            .post(path)
            .set('X-Demo-User-Id', createdById)
            .send(bodyFor(suffix));

      await operation.expect(400).expect({
        statusCode: 400,
        code: 'INVALID_UUID',
        message: '工单 ID 必须是有效的 UUID',
        path,
      });
      expect(repository.findOneBy).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when a valid UUID has no matching request', async () => {
    repository.findOneBy.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .get(`/requests/${id}`)
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'REQUEST_NOT_FOUND',
        message: '工单不存在',
        path: `/requests/${id}`,
      });

    expect(repository.findOneBy).toHaveBeenCalledWith({ id });
  });

  it('returns 200 and the request matching the UUID', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const saved = {
      id,
      title: 'Request',
      description: null,
      status: 'DRAFT',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };
    repository.findOneBy.mockResolvedValueOnce(saved);

    const response = await request(app.getHttpServer())
      .get(`/requests/${id}`)
      .expect(200);

    expect(response.body).toEqual({
      ...saved,
      createdAt: saved.createdAt.toISOString(),
      updatedAt: saved.updatedAt.toISOString(),
    });
    expect(repository.findOneBy).toHaveBeenCalledWith({ id });
  });

  it.each([
    { title: 'a'.repeat(120) },
    { title: 'Request', description: 'Details' },
  ])('returns 201 for valid input: %p', async (body) => {
    const response = await request(app.getHttpServer())
      .post('/requests')
      .set('X-Demo-User-Id', createdById)
      .send(body)
      .expect(201);

    expect(response.body).toEqual({
      ...body,
      description: body.description ?? null,
      createdById,
      id: 'generated-id',
      status: 'DRAFT',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { title: null },
    { title: '' },
    { title: ' \t\n' },
    { title: 123 },
    { title: 'a'.repeat(121) },
    { title: 'Request', description: 123 },
    { title: 'Request', id: 'client-id' },
    { title: 'Request', status: 'APPROVED' },
    { title: 'Request', createdAt: '2020-01-01' },
  ])('returns 400 for invalid input: %p', async (body) => {
    await request(app.getHttpServer())
      .post('/requests')
      .set('X-Demo-User-Id', createdById)
      .send(body)
      .expect(400);
    expect(repository.save).not.toHaveBeenCalled();
  });

  describe.each(writeRoutes)('actor header on POST /requests%s', (route) => {
    it.each([undefined, '', 'not-a-uuid', '123'])(
      'returns INVALID_ACTOR_ID for header %p without starting a transaction',
      async (actorId) => {
        const path = `/requests${route}`;
        const operation = request(app.getHttpServer())
          .post(path)
          .send(bodyFor(route));
        if (actorId !== undefined) operation.set('X-Demo-User-Id', actorId);

        await operation.expect(400).expect({
          statusCode: 400,
          code: 'INVALID_ACTOR_ID',
          message: 'X-Demo-User-Id 必须是有效的 UUID',
          path,
        });
        expect(dataSource.transaction).not.toHaveBeenCalled();
        expect(usersRepository.findOneBy).not.toHaveBeenCalled();
        expect(repository.save).not.toHaveBeenCalled();
      },
    );
  });

  it.each([
    ['missing', {}],
    ['blank', { reason: ' \t\n' }],
    ['over 500 characters', { reason: 'a'.repeat(501) }],
  ])(
    'returns 400 for a %s rejection reason without writing',
    async (_, body) => {
      const path = `/requests/${id}/reject`;
      const response = await request(app.getHttpServer())
        .post(path)
        .set('X-Demo-User-Id', createdById)
        .send(body)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        path,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(repository.findOneBy).not.toHaveBeenCalled();
      expect(queryBuilder.execute).not.toHaveBeenCalled();
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );

  it('returns 404 when the creator does not exist without saving', async () => {
    usersRepository.findOneBy.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/requests')
      .set('X-Demo-User-Id', createdById)
      .send({ title: 'Request' })
      .expect(404)
      .expect({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: '操作用户不存在',
        path: '/requests',
      });

    expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: createdById });
    expect(repository.save).not.toHaveBeenCalled();
  });

  it.each(['submit', 'approve', 'reject'])(
    'returns INVALID_STATUS_TRANSITION for conflicting %s',
    async (action) => {
      repository.findOneBy.mockResolvedValue({ id, status: 'APPROVED' });
      const path = `/requests/${id}/${action}`;

      await request(app.getHttpServer())
        .post(path)
        .set('X-Demo-User-Id', createdById)
        .send(bodyFor(path))
        .expect(409)
        .expect({
          statusCode: 409,
          code: 'INVALID_STATUS_TRANSITION',
          message: '当前工单状态不允许执行此操作',
          path,
        });
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );
});
