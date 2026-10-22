import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserEntity } from '@modules/users/entities/user.entity';
import { RefundWalletAccountEntity } from './refund-wallet-account.entity';
import { RefundWalletReservationStatus } from '../enums/refund-wallet-reservation-status.enum';

@Entity('refund_wallet_reservations')
export class RefundWalletReservationEntity extends BaseEntity {
  @Index('IDX_refund_wallet_reservations_account_status')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => RefundWalletAccountEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: RefundWalletAccountEntity;

  @Index('IDX_refund_wallet_reservations_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity;

  @Index('IDX_refund_wallet_reservations_payment_request_id')
  @Column({ name: 'payment_request_id', type: 'uuid', nullable: true })
  paymentRequestId!: string | null;

  @Index('IDX_refund_wallet_reservations_order_id')
  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ name: 'amount_paise', type: 'bigint' })
  amountPaise!: string;

  @Index('IDX_refund_wallet_reservations_status')
  @Column({
    type: 'enum',
    enum: RefundWalletReservationStatus,
    enumName: 'refund_wallet_reservation_status_enum',
    default: RefundWalletReservationStatus.PENDING,
  })
  status!: RefundWalletReservationStatus;

  @Index('UQ_refund_wallet_reservations_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 150 })
  idempotencyKey!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;
}
