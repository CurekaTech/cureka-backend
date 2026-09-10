import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { UserEntity } from '@modules/users/entities/user.entity';
import { RefundWalletLedgerEntity } from './refund-wallet-ledger.entity';

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

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @OneToMany(() => RefundWalletLedgerEntity, (entry) => entry.account)
  ledger?: RefundWalletLedgerEntity[];
}
