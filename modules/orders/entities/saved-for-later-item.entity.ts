import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';

@Entity('saved_for_later_items')
@Index('IDX_saved_for_later_items_user_created', ['userId', 'createdAt'])
@Index('UQ_saved_for_later_items_user_identity', ['userId', 'identityKey'], { unique: true })
export class SavedForLaterItemEntity extends BaseEntity {
  @Index('IDX_saved_for_later_items_user_id')
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index('IDX_saved_for_later_items_product_id')
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index('IDX_saved_for_later_items_variant_id')
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

  @Column({ name: 'identity_key', type: 'varchar', length: 80 })
  identityKey!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity | null;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity | null;
}
