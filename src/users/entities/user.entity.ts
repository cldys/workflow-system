import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

import { RequestEntity } from '../../requests/entities/request.entity';
import { RequestEventEntity } from '../../request-events/entities/request-event.entity';

export type UserRole = 'EMPLOYEE' | 'APPROVER';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 100 })
  displayName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({
    name: 'password_hash',
    type: 'text',
    nullable: true,
    select: false,
  })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'EMPLOYEE' })
  role!: UserRole;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @OneToMany(() => RequestEntity, (request) => request.createdBy)
  requests!: RequestEntity[];

  @OneToMany(() => RequestEventEntity, (event) => event.actor)
  events!: RequestEventEntity[];
}
