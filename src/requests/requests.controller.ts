import {
  HttpCode,
  HttpStatus,
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateRequestDto } from './dto/create-request.dto';
import { RequestsService } from './requests.service';

import { RejectRequestDto } from './dto/reject-request.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CurrentUserData } from '../auth/current-user-data.interface';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const requestIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      code: 'INVALID_UUID',
      message: '工单 ID 必须是有效的 UUID',
    }),
});

@Controller('requests')
@UseGuards(JwtAuthGuard)
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
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.requestsService.createRequest(dto, user.id);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submitRequest(
    @Param('id', requestIdPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.requestsService.submitRequest(id, user.id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approveRequest(
    @Param('id', requestIdPipe) id: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.requestsService.approveRequest(id, user.id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('id', requestIdPipe) id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.requestsService.rejectRequest(id, user.id, dto.reason);
  }

  @Get(':id/events')
  findEvents(@Param('id', requestIdPipe) id: string) {
    return this.requestsService.findEvents(id);
  }
}
