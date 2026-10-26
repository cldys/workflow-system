import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

import { RequestEntity } from '../../requests/entities/request.entity';
import { RequestEventEntity } from '../../request-events/entities/request-event.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => RequestEntity, (request) => request.createdBy)
  requests!: RequestEntity[];

  @OneToMany(() => RequestEventEntity, (event) => event.actor)
  events!: RequestEventEntity[];
}
