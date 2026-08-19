import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CartEntity } from './cart.entity';

@Entity('cart_items')
export class CartItemEntity extends BaseEntity {
  @Index()
  @Column({ name: 'cart_id', type: 'uuid' })
  cartId!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'is_subscription', type: 'boolean', default: false })
  isSubscription!: boolean;

  @Column({
    type: 'enum',
    enum: ProductSubscriptionFrequency,
    enumName: 'product_subscription_frequency_enum',
    nullable: true,
  })
  frequency!: ProductSubscriptionFrequency | null;

  @ManyToOne(() => CartEntity, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart?: CartEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity;
}
