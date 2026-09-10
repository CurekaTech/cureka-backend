import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { IOrderItemReturnPolicySnapshot } from '../interfaces/order-item-return-policy.interface';
import { OrderEntity } from './order.entity';

@Entity('order_items')
export class OrderItemEntity extends BaseEntity {
  @Index()
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ name: 'product_name', type: 'varchar', length: 500 })
  productName!: string;

  @Column({ name: 'variant_name', type: 'varchar', length: 500, nullable: true })
  variantName!: string | null;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({ name: 'total_price', type: 'decimal', precision: 12, scale: 2 })
  totalPrice!: string;

  @Column({ name: 'is_subscription', type: 'boolean', default: false })
  isSubscription!: boolean;

  @Column({
    type: 'enum',
    enum: ProductSubscriptionFrequency,
    enumName: 'product_subscription_frequency_enum',
    nullable: true,
  })
  frequency!: ProductSubscriptionFrequency | null;

  @Index()
  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;

  /**
   * Return/replacement/refund policy frozen at order-placement time.
   * Null only for items created before this column existed — those fall back to
   * a conservative resolution at eligibility-check time.
   */
  @Column({ name: 'return_policy_snapshot', type: 'jsonb', nullable: true })
  returnPolicySnapshot!: IOrderItemReturnPolicySnapshot | null;

  @ManyToOne(() => OrderEntity, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity;
}
