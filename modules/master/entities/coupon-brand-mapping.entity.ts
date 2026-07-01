import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BrandEntity } from './brand.entity';
import { CouponEntity } from './coupon.entity';

@Entity('coupon_brands')
export class CouponBrandMappingEntity {
  @PrimaryColumn({ name: 'coupon_id', type: 'uuid' })
  couponId!: string;

  @PrimaryColumn({ name: 'brand_id', type: 'uuid' })
  brandId!: string;

  @ManyToOne(() => CouponEntity, (coupon) => coupon.brandMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon!: CouponEntity;

  @Index()
  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand!: BrandEntity;
}
