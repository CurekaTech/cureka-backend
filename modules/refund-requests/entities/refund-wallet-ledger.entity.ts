import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { RefundWalletEntryDirection, RefundWalletEntryType } from '../enums/refund-wallet-entry-type.enum';
import { RefundWalletAccountEntity } from './refund-wallet-account.entity';

@Entity('refund_wallet_ledger')
export class RefundWalletLedgerEntity extends BaseEntity {
  @Index('IDX_refund_wallet_ledger_account_id')
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => RefundWalletAccountEntity, (account) => account.ledger, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'account_id' })
  account?: RefundWalletAccountEntity;

  @Index('IDX_refund_wallet_ledger_customer_id')
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({
    type: 'enum',
    enum: RefundWalletEntryDirection,
    enumName: 'refund_wallet_ledger_direction_enum',
  })
  direction!: RefundWalletEntryDirection;

  @Column({
    type: 'enum',
    enum: RefundWalletEntryType,
    enumName: 'refund_wallet_ledger_type_enum',
  })
  type!: RefundWalletEntryType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ name: 'balance_after', type: 'decimal', precision: 12, scale: 2 })
  balanceAfter!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Index('UQ_refund_wallet_ledger_payout_id', { unique: true })
  @Column({ name: 'payout_id', type: 'uuid', nullable: true })
  payoutId!: string | null;

  @Column({ name: 'refund_request_id', type: 'uuid', nullable: true })
  refundRequestId!: string | null;

  @Column({ name: 'return_request_id', type: 'uuid', nullable: true })
  returnRequestId!: string | null;

  @Index('UQ_refund_wallet_ledger_idempotency_key', { unique: true })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey!: string;
}
