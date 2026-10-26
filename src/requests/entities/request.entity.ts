import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { UserEntity } from '../../users/entities/user.entity';
import { RequestEventEntity } from '../../request-events/entities/request-event.entity';

@Entity('requests')
export class RequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  // 新增：创建人的 UUID
  @Column({ name: 'created_by', type: 'uuid' })
  createdById!: string;

  // 新增：关联的用户对象
  @ManyToOne(() => UserEntity, (user) => user.requests, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'created_by' })
  createdBy!: UserEntity;

  // 新增：这张工单的全部操作历史
  @OneToMany(() => RequestEventEntity, (event) => event.request)
  events!: RequestEventEntity[];
}
