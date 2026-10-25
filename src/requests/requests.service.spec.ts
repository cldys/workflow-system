import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestEntity } from './entities/request.entity';
import { RequestsService } from './requests.service';

describe('RequestsService', () => {
  let service: RequestsService;
  const repository = {
    create: jest.fn((data: Partial<RequestEntity>) => data),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(RequestEntity), useValue: repository },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  it.each([undefined, 'Details'])(
    'creates a request with description %p',
    async (description) => {
      const dto = { title: 'a'.repeat(120), description };
      const saved = {
        ...dto,
        id: 'generated-id',
        status: 'DRAFT',
        createdAt: new Date(),
      };
      repository.save.mockResolvedValue(saved);

      await expect(service.createRequest(dto)).resolves.toEqual(saved);
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
      id: 'client-id',
      status: 'APPROVED',
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as CreateRequestDto);

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Request',
      description: undefined,
      status: 'DRAFT',
    });
  });
});
