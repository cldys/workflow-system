import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestEntity } from './entities/request.entity';
import { CreateRequestDto } from './dto/create-request.dto';

@Injectable()
export class RequestsService {
  constructor(
    @InjectRepository(RequestEntity)
    private readonly repository: Repository<RequestEntity>,
  ) {}

  async findAll(): Promise<RequestEntity[]> {
    return this.repository.find();
  }

  // 创建请求单
  async createRequest(dto: CreateRequestDto): Promise<RequestEntity> {
    const request = this.repository.create({
      title: dto.title,
      description: dto.description,
      status: 'DRAFT',
    });

    return this.repository.save(request);
  }
}
