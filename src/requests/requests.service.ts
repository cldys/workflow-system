import {
  ConflictException,
  Injectable,
  NotFoundException,
  BadRequestException,
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
      throw new NotFoundException({
        code: 'REQUEST_NOT_FOUND',
        message: '工单不存在',
      });
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
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: '操作用户不存在',
        });
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

  // 提交工单
  async submitRequest(id: string, actorId: string): Promise<RequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(RequestEntity);
      const users = manager.getRepository(UserEntity);
      const events = manager.getRepository(RequestEventEntity);

      // 1. 查找工单
      const request = await requests.findOneBy({ id });

      if (!request) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: '工单不存在',
        });
      }

      // 2. 验证操作人
      const actor = await users.findOneBy({ id: actorId });

      if (!actor) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: '操作用户不存在',
        });
      }

      // 3. 检查当前状态
      if (request.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: '当前工单状态不允许执行此操作',
        });
      }

      // 4. 更新状态
      const fromStatus = request.status;
      request.status = 'PENDING';

      const savedRequest = await requests.save(request);

      // 5. 记录状态变化
      const event = events.create({
        requestId: savedRequest.id,
        actorId: actor.id,
        action: 'SUBMITTED',
        fromStatus,
        toStatus: 'PENDING',
        note: null,
      });

      await events.save(event);

      // 6. 返回更新后的工单
      return savedRequest;
    });
  }

  // 审批通过
  async approveRequest(id: string, actorId: string): Promise<RequestEntity> {
    return this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(RequestEntity);
      const users = manager.getRepository(UserEntity);
      const events = manager.getRepository(RequestEventEntity);

      // 1. 确认工单存在
      const request = await requests.findOneBy({ id });

      if (!request) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: '工单不存在',
        });
      }

      // 2. 确认操作人存在
      const actor = await users.findOneBy({ id: actorId });

      if (!actor) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: '操作用户不存在',
        });
      }

      // 3. 记录状态变更前的状态
      const fromStatus = request.status;

      // 4. 原子地更新状态，避免竞争请求重复成功
      const result = await requests
        .createQueryBuilder()
        .update(RequestEntity)
        .set({ status: 'APPROVED' })
        .where('id = :id', { id })
        .andWhere('status = :status', { status: 'PENDING' })
        .execute();

      if (result.affected !== 1) {
        const current = await requests.findOneBy({ id });

        if (!current) {
          throw new NotFoundException({
            code: 'REQUEST_NOT_FOUND',
            message: '工单不存在',
          });
        }

        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: '当前工单状态不允许执行此操作',
        });
      }

      // 5. 只有状态更新成功，才能写入事件
      const event = events.create({
        requestId: id,
        actorId: actor.id,
        action: 'APPROVED',
        fromStatus: 'PENDING',
        toStatus: 'APPROVED',
        note: null,
      });

      await events.save(event);

      // 6. 返回最新的工单
      const updatedRequest = await requests.findOneBy({ id });

      if (!updatedRequest) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: '工单不存在',
        });
      }

      return updatedRequest;
    });
  }

  async rejectRequest(
    id: string,
    actorId: string,
    reason: string,
  ): Promise<RequestEntity> {
    const note = reason.trim();

    if (!note || note.length > 500) {
      throw new BadRequestException('reason must contain 1 to 500 characters');
    }

    return this.dataSource.transaction(async (manager) => {
      const requests = manager.getRepository(RequestEntity);
      const users = manager.getRepository(UserEntity);
      const events = manager.getRepository(RequestEventEntity);

      const request = await requests.findOneBy({ id });

      if (!request) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: '工单不存在',
        });
      }

      const actor = await users.findOneBy({ id: actorId });

      if (!actor) {
        throw new NotFoundException({
          code: 'USER_NOT_FOUND',
          message: '操作用户不存在',
        });
      }

      const result = await requests
        .createQueryBuilder()
        .update(RequestEntity)
        .set({ status: 'REJECTED' })
        .where('id = :id', { id })
        .andWhere('status = :status', { status: 'PENDING' })
        .execute();

      if (result.affected !== 1) {
        const current = await requests.findOneBy({ id });

        if (!current) {
          throw new NotFoundException({
            code: 'REQUEST_NOT_FOUND',
            message: '工单不存在',
          });
        }

        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: '当前工单状态不允许执行此操作',
        });
      }

      const event = events.create({
        requestId: id,
        actorId: actor.id,
        action: 'REJECTED',
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
        note,
      });

      await events.save(event);

      const updatedRequest = await requests.findOneBy({ id });

      if (!updatedRequest) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: '工单不存在',
        });
      }

      return updatedRequest;
    });
  }

  // 查找操作历史
  async findEvents(id: string): Promise<RequestEventEntity[]> {
    const request = await this.repository.findOneBy({ id });

    if (!request) {
      throw new NotFoundException({
        code: 'REQUEST_NOT_FOUND',
        message: '工单不存在',
      });
    }

    return this.dataSource.getRepository(RequestEventEntity).find({
      where: { requestId: id },
      order: {
        createdAt: 'ASC',
        id: 'ASC',
      },
    });
  }
}
