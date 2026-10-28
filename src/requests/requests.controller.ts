import {
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

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get()
  findAll() {
    return this.requestsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.requestsService.findOne(id);
  }

  @Post()
  createRequest(
    @Body() dto: CreateRequestDto,
    @Headers('x-demo-user-id') actorId: string,
  ) {
    if (!actorId || !isUUID(actorId)) {
      throw new BadRequestException('X-Demo-User-Id must be a valid UUID');
    }
    return this.requestsService.createRequest(dto, actorId);
  }
}
