import { OrderEntity } from '@modules/orders/entities/order.entity';
import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

@Entity('gokwik_refunds')
export class GokwikRefundEntity extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index({ unique: true })
  @Column({ name: 'refund_id', type: 'varchar', length: 200 })
  refundId!: string;

  @Column({ name: 'payment_id', type: 'varchar', length: 200 })
  paymentId!: string;

  @Column({ name: 'transaction_payment_id', type: 'varchar', length: 200, nullable: true })
  transactionPaymentId!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Index()
  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({ type: 'boolean', default: false })
  auto!: boolean;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;
}
