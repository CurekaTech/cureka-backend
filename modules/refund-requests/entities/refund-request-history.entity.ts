import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { RefundHistoryAction } from '../enums/refund-history-action.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestEntity } from './refund-request.entity';

@Entity('refund_request_history')
export class RefundRequestHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_refund_request_history_refund_request_id')
  @Column({ name: 'refund_request_id', type: 'uuid' })
  refundRequestId!: string;

  @ManyToOne(() => RefundRequestEntity, (request) => request.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refund_request_id' })
  refundRequest?: RefundRequestEntity;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: RefundRequestStatus,
    enumName: 'refund_requests_status_enum',
    nullable: true,
  })
  fromStatus!: RefundRequestStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: RefundRequestStatus,
    enumName: 'refund_requests_status_enum',
  })
  toStatus!: RefundRequestStatus;

  @Column({
    type: 'enum',
    enum: RefundHistoryAction,
    enumName: 'refund_request_history_action_enum',
  })
  action!: RefundHistoryAction;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ name: 'performed_by', type: 'varchar', length: 255 })
  performedBy!: string;

  @Column({ name: 'performed_by_role', type: 'varchar', length: 64, nullable: true })
  performedByRole!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
