import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';import { ProductEntity } from '@modules/product/entities/product.entity';
import { CouponEntity } from './coupon.entity';

@Entity('coupon_products')
export class CouponProductMappingEntity {
  @PrimaryColumn({ name: 'coupon_id', type: 'uuid' })
  couponId!: string;

  @PrimaryColumn({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => CouponEntity, (coupon) => coupon.productMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon!: CouponEntity;

  @Index()
  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;
}
