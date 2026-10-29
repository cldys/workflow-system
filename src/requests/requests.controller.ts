import {
  HttpCode,
  HttpStatus,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestsService } from './requests.service';

import { isUUID } from 'class-validator';
import { RejectRequestDto } from './dto/reject-request.dto';

const requestIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      code: 'INVALID_UUID',
      message: '工单 ID 必须是有效的 UUID',
    }),
});

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll() {
    return this.requestsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', requestIdPipe) id: string) {
    return this.requestsService.findOne(id);
  }

  @Post()
  createRequest(
    @Body() dto: CreateRequestDto,
    @Headers('x-demo-user-id') actorId: string,
  ) {
    if (!actorId || !isUUID(actorId)) {
      throw new BadRequestException({
        code: 'INVALID_ACTOR_ID',
        message: 'X-Demo-User-Id 必须是有效的 UUID',
      });
    }
    return this.requestsService.createRequest(dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submitRequest(
    @Param('id', requestIdPipe) id: string,
    @Headers('x-demo-user-id')
    actorId: string,
  ) {
    // 手动校验：先使用 @Headers() 获取值，再通过 if 判断并抛出异常。
    if (!actorId || !isUUID(actorId)) {
      throw new BadRequestException({
        code: 'INVALID_ACTOR_ID',
        message: 'X-Demo-User-Id 必须是有效的 UUID',
      });
    }
    return this.requestsService.submitRequest(id, actorId);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveRequest(
    @Param('id', requestIdPipe) id: string,
    @Headers('x-demo-user-id') actorId: string,
  ) {
    if (!actorId || !isUUID(actorId)) {
      throw new BadRequestException({
        code: 'INVALID_ACTOR_ID',
        message: 'X-Demo-User-Id 必须是有效的 UUID',
      });
    }

    return this.requestsService.approveRequest(id, actorId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('id', requestIdPipe) id: string,
    @Body() dto: RejectRequestDto,
    @Headers('x-demo-user-id') actorId: string,
  ) {
    if (!actorId || !isUUID(actorId)) {
      throw new BadRequestException({
        code: 'INVALID_ACTOR_ID',
        message: 'X-Demo-User-Id 必须是有效的 UUID',
      });
    }

    return this.requestsService.rejectRequest(id, actorId, dto.reason);
  }

  @Get(':id/events')
  findEvents(@Param('id', requestIdPipe) id: string) {
    return this.requestsService.findEvents(id);
  }
}
