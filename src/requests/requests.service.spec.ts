import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEntity } from './entities/request.entity';
import { RequestsService } from './requests.service';
import { RequestEventEntity } from '../request-events/entities/request-event.entity';
import { UserEntity } from '../users/entities/user.entity';

describe('RequestsService', () => {
  let service: RequestsService;
  const id = '550e8400-e29b-41d4-a716-446655440000';
  const actorId = '550e8400-e29b-41d4-a716-446655440001';
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
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const eventsRepository = {
    create: jest.fn((data: Partial<RequestEventEntity>) => data),
    save: jest.fn(),
    find: jest.fn(),
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
    getRepository: manager.getRepository,
  };
  const transitions = [
    'submitRequest',
    'approveRequest',
    'rejectRequest',
  ] as const;

  beforeEach(async () => {
    jest.clearAllMocks();
    repository.findOneBy.mockReset();
    repository.findOneBy.mockResolvedValue({ id, status: 'PENDING' });
    usersRepository.findOneBy.mockResolvedValue({ id: actorId });
    queryBuilder.execute.mockReset().mockResolvedValue({ affected: 1 });
    const module = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(RequestEntity), useValue: repository },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(RequestsService);
  });

  it('returns the request matching the UUID', async () => {
    const saved = { id, title: 'Request', status: 'DRAFT' };
    repository.findOneBy.mockResolvedValueOnce(saved);

    await expect(service.findOne(id)).resolves.toEqual(saved);
    expect(repository.findOneBy).toHaveBeenCalledWith({ id });
  });

  it.each(['findOne', 'findEvents', ...transitions] as const)(
    '%s reports REQUEST_NOT_FOUND without writing',
    async (method) => {
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service[method](id, actorId, 'Reason'),
      ).rejects.toMatchObject({
        constructor: NotFoundException,
        status: 404,
        response: { code: 'REQUEST_NOT_FOUND', message: '工单不存在' },
      });
      expect(repository.findOneBy).toHaveBeenCalledWith({ id });
      expect(repository.save).not.toHaveBeenCalled();
      expect(queryBuilder.execute).not.toHaveBeenCalled();
      expect(eventsRepository.save).not.toHaveBeenCalled();
      expect(eventsRepository.find).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'Details'])(
    'creates a request with description %p',
    async (description) => {
      const dto = { title: 'a'.repeat(120), description };
      const draft = {
        title: dto.title,
        description: description ?? null,
        createdById: actorId,
        status: 'DRAFT',
      };
      const saved = { ...draft, id, createdAt: new Date() };
      repository.save.mockResolvedValueOnce(saved);

      await expect(service.createRequest(dto, actorId)).resolves.toEqual(saved);
      expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: actorId });
      expect(repository.create).toHaveBeenCalledWith(draft);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledWith(draft);
      expect(eventsRepository.save).toHaveBeenCalledTimes(1);
      expect(eventsRepository.save).toHaveBeenCalledWith({
        requestId: id,
        actorId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'DRAFT',
        note: null,
      });
    },
  );

  it('does not copy server-controlled fields from input', async () => {
    repository.save.mockResolvedValueOnce({ id });
    await service.createRequest(
      {
        title: 'Request',
        createdById: 'client-user-id',
        createdBy: { id: 'client-user-id' },
        id: 'client-id',
        status: 'APPROVED',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      } as CreateRequestDto,
      actorId,
    );

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Request',
      description: null,
      status: 'DRAFT',
      createdById: actorId,
    });
  });

  it('submits a DRAFT request and saves its transition event', async () => {
    const draft = { id, status: 'DRAFT' };
    const saved = { id, status: 'PENDING' };
    repository.findOneBy.mockResolvedValueOnce(draft);
    repository.save.mockResolvedValueOnce(saved);

    await expect(service.submitRequest(id, actorId)).resolves.toEqual(saved);

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(saved);
    expect(queryBuilder.execute).not.toHaveBeenCalled();
    expect(eventsRepository.save).toHaveBeenCalledTimes(1);
    expect(eventsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: id,
        actorId,
        action: 'SUBMITTED',
        fromStatus: 'DRAFT',
        toStatus: 'PENDING',
        note: null,
      }),
    );
  });

  it.each([
    ['approveRequest', 'APPROVED', null],
    ['rejectRequest', 'REJECTED', 'Reason'],
  ] as const)(
    '%s conditionally updates PENDING and saves the correct event',
    async (method, status, note) => {
      const updated = { id, status };
      repository.findOneBy
        .mockResolvedValueOnce({ id, status: 'PENDING' })
        .mockResolvedValueOnce(updated);

      await expect(service[method](id, actorId, '  Reason  ')).resolves.toEqual(
        updated,
      );

      expect(queryBuilder.update).toHaveBeenCalledWith(RequestEntity);
      expect(queryBuilder.set).toHaveBeenCalledWith({ status });
      expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', { id });
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :status', {
        status: 'PENDING',
      });
      expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(repository.findOneBy).toHaveBeenCalledTimes(2);
      expect(repository.save).not.toHaveBeenCalled();
      expect(eventsRepository.save).toHaveBeenCalledTimes(1);
      expect(eventsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: id,
          actorId,
          action: status,
          fromStatus: 'PENDING',
          toStatus: status,
          note,
        }),
      );
    },
  );

  it.each(['createRequest', ...transitions] as const)(
    '%s reports USER_NOT_FOUND without writing',
    async (method) => {
      usersRepository.findOneBy.mockResolvedValueOnce(null);
      const operation =
        method === 'createRequest'
          ? service.createRequest({ title: 'Request' }, actorId)
          : service[method](id, actorId, 'Reason');

      await expect(operation).rejects.toMatchObject({
        constructor: NotFoundException,
        status: 404,
        response: { code: 'USER_NOT_FOUND', message: '操作用户不存在' },
      });
      expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: actorId });
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
      expect(queryBuilder.execute).not.toHaveBeenCalled();
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['submitRequest', 'PENDING'],
    ['submitRequest', 'APPROVED'],
    ['submitRequest', 'REJECTED'],
    ['approveRequest', 'DRAFT'],
    ['approveRequest', 'APPROVED'],
    ['approveRequest', 'REJECTED'],
    ['rejectRequest', 'DRAFT'],
    ['rejectRequest', 'APPROVED'],
    ['rejectRequest', 'REJECTED'],
  ] as const)(
    '%s rejects status %s with a stable code',
    async (method, status) => {
      repository.findOneBy.mockResolvedValue({ id, status });
      queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service[method](id, actorId, 'Reason'),
      ).rejects.toMatchObject({
        constructor: ConflictException,
        status: 409,
        response: {
          code: 'INVALID_STATUS_TRANSITION',
          message: '当前工单状态不允许执行此操作',
        },
      });
      expect(repository.save).not.toHaveBeenCalled();
      if (method === 'submitRequest') {
        expect(queryBuilder.execute).not.toHaveBeenCalled();
      } else {
        expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
        expect(queryBuilder.where).toHaveBeenCalledWith('id = :id', { id });
        expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :status', {
          status: 'PENDING',
        });
        expect(repository.findOneBy).toHaveBeenCalledTimes(2);
      }
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each(['approveRequest', 'rejectRequest'] as const)(
    '%s reports a conflict when a concurrent transition wins',
    async (method) => {
      repository.findOneBy
        .mockResolvedValueOnce({ id, status: 'PENDING' })
        .mockResolvedValueOnce({ id, status: 'APPROVED' });
      queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service[method](id, actorId, 'Reason'),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATUS_TRANSITION' },
      });
      expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :status', {
        status: 'PENDING',
      });
      expect(repository.findOneBy).toHaveBeenCalledTimes(2);
      expect(repository.save).not.toHaveBeenCalled();
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each(['approveRequest', 'rejectRequest'] as const)(
    '%s reports REQUEST_NOT_FOUND when the request disappears during update',
    async (method) => {
      repository.findOneBy
        .mockResolvedValueOnce({ id })
        .mockResolvedValueOnce(null);
      queryBuilder.execute.mockResolvedValueOnce({ affected: 0 });

      await expect(
        service[method](id, actorId, 'Reason'),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'REQUEST_NOT_FOUND', message: '工单不存在' },
      });
      expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
      expect(eventsRepository.save).not.toHaveBeenCalled();
    },
  );

  it.each(['approveRequest', 'rejectRequest'] as const)(
    '%s reports REQUEST_NOT_FOUND when the final lookup fails',
    async (method) => {
      repository.findOneBy
        .mockResolvedValueOnce({ id })
        .mockResolvedValueOnce(null);

      await expect(
        service[method](id, actorId, 'Reason'),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: 'REQUEST_NOT_FOUND', message: '工单不存在' },
      });
    },
  );
});
