import { OrderEntity } from '@modules/orders/entities/order.entity';
import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, OneToOne } from 'typeorm';

@Entity('gokwik_orders')
@Index('UQ_gokwik_orders_cart_id', ['cartId'], { unique: true })
export class GokwikOrderEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Index({ unique: true })
  @Column({ name: 'gokwik_order_id', type: 'varchar', length: 100, nullable: true })
  gokwikOrderId!: string | null;

  @Index({ unique: true })
  @Column({ name: 'payment_id', type: 'varchar', length: 200, nullable: true })
  paymentId!: string | null;

  @Column({ name: 'gateway_transaction_id', type: 'varchar', length: 200, nullable: true })
  gatewayTransactionId!: string | null;

  @Column({ name: 'payment_method', type: 'varchar', length: 40 })
  paymentMethod!: string;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 12, scale: 2 })
  paymentAmount!: string;

  @Column({ name: 'prepaid_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  prepaidAmount!: string;

  @Column({ name: 'payable_on_delivery', type: 'decimal', precision: 12, scale: 2, default: 0 })
  payableOnDelivery!: string;

  @Column({ name: 'customer_phone', type: 'varchar', length: 10 })
  customerPhone!: string;

  @Column({ name: 'metadata', type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @OneToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;
}
