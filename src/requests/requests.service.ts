import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RequestEntity } from './entities/request.entity';
import { CreateRequestDto } from './dto/create-request.dto';
import { UserEntity } from '../users/entities/user.entity';
import { RequestEventEntity } from '../request-events/entities/request-event.entity';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly repository: Repository<RequestEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<RequestEntity[]> {
    return this.repository.find();
  }

  async findOne(id: string): Promise<RequestEntity> {
    const request = await this.repository.findOneBy({ id });

    if (!request) {
      throw new NotFoundException(`Request ${id} not found`);
    }

    return request;
  }

  // 创建请求单
  async createRequest(
    dto: CreateRequestDto,
    actorId: string,
  ): Promise<RequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const requests = manager.getRepository(RequestEntity);
      const events = manager.getRepository(RequestEventEntity);

      // 1. 验证操作人是否存在
      const actor = await users.findOneBy({ id: actorId });

      if (!actor) {
        throw new NotFoundException(`User ${actorId} not found`);
      }

      // 2. 创建 DRAFT 工单
      const request = requests.create({
        title: dto.title,
        description: dto.description ?? null,
        status: 'DRAFT',
        createdById: actor.id,
      });

      const savedRequest = await requests.save(request);

      // 3. 写入 CREATED 历史
      const event = events.create({
        requestId: savedRequest.id,
        actorId: actor.id,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'DRAFT',
        note: null,
      });

      await events.save(event);

      // 4. 返回创建成功的工单
      return savedRequest;
    });
  }
}
