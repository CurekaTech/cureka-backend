import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ReturnHistoryAction } from '../enums/return-history-action.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnRequestEntity } from './return-request.entity';

@Entity('return_status_history')
export class ReturnStatusHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_return_status_history_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid' })
  returnRequestId!: string;

  @ManyToOne(() => ReturnRequestEntity, (request) => request.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest?: ReturnRequestEntity;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ReturnStatus,
    enumName: 'return_requests_status_enum',
    nullable: true,
  })
  fromStatus!: ReturnStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: ReturnStatus,
    enumName: 'return_requests_status_enum',
  })
  toStatus!: ReturnStatus;

  @Column({
    type: 'enum',
    enum: ReturnHistoryAction,
    enumName: 'return_status_history_action_enum',
  })
  action!: ReturnHistoryAction;

  /**
   * Internal notes and customer-visible comments share this table but are
   * separated by `isCustomerVisible`; customer-facing mappers filter on it.
   */
  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Index('IDX_return_status_history_is_customer_visible')
  @Column({ name: 'is_customer_visible', type: 'boolean', default: false })
  isCustomerVisible!: boolean;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ name: 'performed_by_role', type: 'varchar', length: 64, nullable: true })
  performedByRole!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
