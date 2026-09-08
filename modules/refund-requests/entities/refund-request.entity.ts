import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundReason } from '../enums/refund-reason.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestedByType } from '../enums/refund-requested-by-type.enum';
import { RefundRequestHistoryEntity } from './refund-request-history.entity';

@Entity('refund_requests')
export class RefundRequestEntity extends BaseEntity {
  @Index('IDX_refund_requests_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Index('IDX_refund_requests_order_number')
  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  @Index('IDX_refund_requests_customer_id')
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity | null;

  @Column({ name: 'payment_request_id', type: 'uuid', nullable: true })
  paymentRequestId!: string | null;

  @Column({
    type: 'enum',
    enum: RefundReason,
    enumName: 'refund_requests_reason_enum',
  })
  reason!: RefundReason;

  @Column({ name: 'reason_details', type: 'text', nullable: true })
  reasonDetails!: string | null;

  @Column({ name: 'requested_amount', type: 'decimal', precision: 12, scale: 2 })
  requestedAmount!: string;

  @Column({ name: 'approved_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  approvedAmount!: string | null;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Index('IDX_refund_requests_status')
  @Column({
    type: 'enum',
    enum: RefundRequestStatus,
    enumName: 'refund_requests_status_enum',
    default: RefundRequestStatus.REQUESTED,
  })
  status!: RefundRequestStatus;

  @Column({ name: 'original_payment_method', type: 'varchar', length: 50 })
  originalPaymentMethod!: string;

  @Index('IDX_refund_requests_payment_provider')
  @Column({
    name: 'payment_provider',
    type: 'enum',
    enum: RefundPaymentProvider,
    enumName: 'refund_requests_payment_provider_enum',
  })
  paymentProvider!: RefundPaymentProvider;

  @Column({ name: 'provider_payment_id', type: 'varchar', length: 200, nullable: true })
  providerPaymentId!: string | null;

  @Index('IDX_refund_requests_provider_refund_id')
  @Column({ name: 'provider_refund_id', type: 'varchar', length: 200, nullable: true })
  providerRefundId!: string | null;

  @Column({ name: 'provider_refund_status', type: 'varchar', length: 80, nullable: true })
  providerRefundStatus!: string | null;

  @Index('UQ_refund_requests_merchant_reference', { unique: true })
  @Column({ name: 'merchant_refund_reference', type: 'varchar', length: 64 })
  merchantRefundReference!: string;

  @Column({ name: 'provider_response_reference', type: 'varchar', length: 200, nullable: true })
  providerResponseReference!: string | null;

  @Column({
    name: 'requested_by_type',
    type: 'enum',
    enum: RefundRequestedByType,
    enumName: 'refund_requests_requested_by_type_enum',
  })
  requestedByType!: RefundRequestedByType;

  @Column({ name: 'requested_by_id', type: 'varchar', length: 64, nullable: true })
  requestedById!: string | null;

  @Index('IDX_refund_requests_assigned_to_user_id')
  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId!: string | null;

  @Column({ name: 'assigned_role_id', type: 'uuid', nullable: true })
  assignedRoleId!: string | null;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 64, nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 64, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'varchar', length: 64, nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'processing_started_by', type: 'varchar', length: 64, nullable: true })
  processingStartedBy!: string | null;

  @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true })
  processingStartedAt!: Date | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'failed_at', type: 'timestamptz', nullable: true })
  failedAt!: Date | null;

  @Column({ name: 'failure_code', type: 'varchar', length: 80, nullable: true })
  failureCode!: string | null;

  @Column({ name: 'failure_message', type: 'text', nullable: true })
  failureMessage!: string | null;

  @Column({ name: 'expected_credit_from', type: 'timestamptz', nullable: true })
  expectedCreditFrom!: Date | null;

  @Column({ name: 'expected_credit_to', type: 'timestamptz', nullable: true })
  expectedCreditTo!: Date | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'escalation_level', type: 'int', default: 0 })
  escalationLevel!: number;

  @OneToMany(() => RefundRequestHistoryEntity, (history) => history.refundRequest)
  history?: RefundRequestHistoryEntity[];
}
