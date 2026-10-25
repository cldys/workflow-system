import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { RequestEntity } from './entities/request.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

describe('RequestsController', () => {
  let app: INestApplication;
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
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      controllers: [RequestsController],
      providers: [
        RequestsService,
        { provide: getRepositoryToken(RequestEntity), useValue: repository },
      ],
    }).compile();

    app = module.createNestApplication();
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

  it('returns 400 for an invalid UUID without querying the repository', async () => {
    await request(app.getHttpServer()).get('/requests/not-a-uuid').expect(400);

    expect(repository.findOneBy).not.toHaveBeenCalled();
  });

  it('returns 404 when a valid UUID has no matching request', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    repository.findOneBy.mockResolvedValueOnce(null);

    await request(app.getHttpServer()).get(`/requests/${id}`).expect(404);

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
      .send(body)
      .expect(201);

    expect(response.body).toEqual({
      ...body,
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
    await request(app.getHttpServer()).post('/requests').send(body).expect(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
});
