import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEntity } from './entities/request.entity';
import { RequestsService } from './requests.service';
import { UserEntity } from '../users/entities/user.entity';

describe('RequestsService', () => {
  let service: RequestsService;
  const createdById = '550e8400-e29b-41d4-a716-446655440001';
  const usersRepository = { findOneBy: jest.fn() };
  const repository = {
    findOneBy: jest.fn(),
    create: jest.fn((data: Partial<RequestEntity>) => data),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    usersRepository.findOneBy.mockResolvedValue({ id: createdById });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(RequestEntity), useValue: repository },
        { provide: getRepositoryToken(UserEntity), useValue: usersRepository },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  it('returns the request matching the UUID', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    const saved = { id, title: 'Request', status: 'DRAFT' };
    repository.findOneBy.mockResolvedValueOnce(saved);

    await expect(service.findOne(id)).resolves.toEqual(saved);
    expect(repository.findOneBy).toHaveBeenCalledWith({ id });
  });

  it('throws NotFoundException when the UUID has no matching request', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    repository.findOneBy.mockResolvedValueOnce(null);

    await expect(service.findOne(id)).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.findOneBy).toHaveBeenCalledWith({ id });
  });

  it.each([undefined, 'Details'])(
    'creates a request with description %p',
    async (description) => {
      const dto = { title: 'a'.repeat(120), description, createdById };
      const saved = {
        ...dto,
        id: 'generated-id',
        status: 'DRAFT',
        createdAt: new Date(),
      };
      repository.save.mockResolvedValue(saved);

      await expect(service.createRequest(dto)).resolves.toEqual(saved);
      expect(usersRepository.findOneBy).toHaveBeenCalledWith({ id: createdById });
      expect(repository.create).toHaveBeenCalledWith({
        ...dto,
        status: 'DRAFT',
      });
      expect(repository.save).toHaveBeenCalledWith({ ...dto, status: 'DRAFT' });
    },
  );

  it('does not copy server-controlled fields from input', async () => {
    await service.createRequest({
      title: 'Request',
      createdById,
      createdBy: { id: 'client-user-id' },
      id: 'client-id',
      status: 'APPROVED',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as CreateRequestDto);

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Request',
      description: undefined,
      status: 'DRAFT',
      createdById,
    });
  });

  it('rejects creation when the creator does not exist without saving', async () => {
    usersRepository.findOneBy.mockResolvedValueOnce(null);

    await expect(
      service.createRequest({ title: 'Request', createdById }),
    ).rejects.toThrow(new NotFoundException(`User ${createdById} not found`));
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
