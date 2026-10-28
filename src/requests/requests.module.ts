import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestEntity } from './entities/request.entity';
import { UserEntity } from '../users/entities/user.entity';
import { RequestEventEntity } from '../request-events/entities/request-event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RequestEntity, UserEntity, RequestEventEntity]),
  ],
  controllers: [RequestsController],
  providers: [RequestsService],
})
export class RequestsModule {}
