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
