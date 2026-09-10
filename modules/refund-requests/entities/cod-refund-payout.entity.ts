import { Column, Entity, Index, JoinColumn, ManyToOne, VersionColumn } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { RefundRequestEntity } from './refund-request.entity';

@Entity('cod_refund_payouts')
export class CodRefundPayoutEntity extends BaseEntity {
  @Index('UQ_cod_refund_payouts_refund_request_id', { unique: true })
  @Column({ name: 'refund_request_id', type: 'uuid' })
  refundRequestId!: string;

  @ManyToOne(() => RefundRequestEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'refund_request_id' })
  refundRequest?: RefundRequestEntity;

  @Index('IDX_cod_refund_payouts_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid', nullable: true })
  returnRequestId!: string | null;

  @Index('IDX_cod_refund_payouts_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Index('IDX_cod_refund_payouts_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({
    name: 'refund_method',
    type: 'enum',
    enum: CodRefundMethod,
    enumName: 'cod_refund_payouts_refund_method_enum',
  })
  refundMethod!: CodRefundMethod;

  @Index('IDX_cod_refund_payouts_status')
  @Column({
    name: 'status',
    type: 'enum',
    enum: CodPayoutStatus,
    enumName: 'cod_refund_payouts_status_enum',
    default: CodPayoutStatus.PENDING_DETAILS,
  })
  status!: CodPayoutStatus;

  @Column({ name: 'account_holder_name', type: 'varchar', length: 150, nullable: true })
  accountHolderName!: string | null;

  @Column({ name: 'masked_account_number', type: 'varchar', length: 20, nullable: true })
  maskedAccountNumber!: string | null;

  @Column({ name: 'account_number_last4', type: 'varchar', length: 4, nullable: true })
  accountNumberLast4!: string | null;

  @Column({ name: 'ifsc', type: 'varchar', length: 11, nullable: true })
  ifsc!: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 150, nullable: true })
  bankName!: string | null;

  @Column({ name: 'account_type', type: 'varchar', length: 20, nullable: true })
  accountType!: string | null;

  @Column({ name: 'processed_by', type: 'varchar', length: 64, nullable: true })
  processedBy!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'verified_by', type: 'varchar', length: 64, nullable: true })
  verifiedBy!: string | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'utr', type: 'varchar', length: 64, nullable: true })
  utr!: string | null;

  @Column({ name: 'transfer_date', type: 'date', nullable: true })
  transferDate!: string | null;

  @Column({ name: 'payment_proof_path', type: 'varchar', length: 500, nullable: true })
  paymentProofPath!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes!: string | null;

  @Column({ name: 'customer_visible_notes', type: 'text', nullable: true })
  customerVisibleNotes!: string | null;

  @Column({ name: 'wallet_ledger_id', type: 'uuid', nullable: true })
  walletLedgerId!: string | null;

  @Column({ name: 'provider_code', type: 'varchar', length: 40, default: 'MANUAL' })
  providerCode!: string;

  @VersionColumn({ name: 'version' })
  version!: number;
}
