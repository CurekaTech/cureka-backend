import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferEntity } from './promotional-offer.entity';

@Entity('promotional_offer_targets')
@Unique('UQ_promotional_offer_target', ['offerId', 'role', 'variantId'])
export class PromotionalOfferTargetEntity extends BaseEntity {
  @Index()
  @Column({ name: 'offer_id', type: 'uuid' })
  offerId!: string;

  @Index()
  @Column({
    type: 'enum',
    enum: PromotionalOfferTargetRole,
    enumName: 'promotional_offer_targets_role_enum',
  })
  role!: PromotionalOfferTargetRole;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'int', nullable: true })
  quantity!: number | null;

  @ManyToOne(() => PromotionalOfferEntity, (offer) => offer.targets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'offer_id' })
  offer?: PromotionalOfferEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity;
}
