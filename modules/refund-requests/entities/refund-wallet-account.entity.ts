import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserEntity } from '@modules/users/entities/user.entity';
import { RefundWalletLedgerEntity } from './refund-wallet-ledger.entity';
import { RefundWalletAccountStatus } from '../enums/refund-wallet-account-status.enum';

@Entity('refund_wallet_accounts')
export class RefundWalletAccountEntity extends BaseEntity {
  @Index('UQ_refund_wallet_accounts_customer_id', { unique: true })
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity;

  @Column({ name: 'available_balance', type: 'decimal', precision: 12, scale: 2, default: 0 })
  availableBalance!: string;

  /** Reservations are held separately from posted ledger balance. */
  @Column({ name: 'reserved_balance_paise', type: 'bigint', default: 0 })
  reservedBalancePaise!: string;

  @Column({
    type: 'enum',
    enum: RefundWalletAccountStatus,
    enumName: 'refund_wallet_account_status_enum',
    default: RefundWalletAccountStatus.ACTIVE,
  })
  status!: RefundWalletAccountStatus;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @OneToMany(() => RefundWalletLedgerEntity, (entry) => entry.account)
  ledger?: RefundWalletLedgerEntity[];
}
