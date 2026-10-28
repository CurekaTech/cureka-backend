import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type CartRecoverySnapshotItem = {
  productId: string;
  variantId: string;
  quantity: number;
  productName: string;
  sku: string;
};

@Entity('cart_recovery_snapshots')
export class CartRecoverySnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  token!: string;

  @Index()
  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Column({ name: 'checkout_id', type: 'varchar', length: 80 })
  checkoutId!: string;

  @Column({ type: 'jsonb' })
  items!: CartRecoverySnapshotItem[];

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'restored_at', type: 'timestamptz', nullable: true })
  restoredAt!: Date | null;

  @Column({ name: 'created_by', type: 'varchar', length: 255, nullable: true })
  createdBy?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
