import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { CouponApplicabilityScope } from '../enums/coupon-applicability-scope.enum';
import { CouponDiscountType } from '../enums/coupon-discount-type.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { CouponBrandMappingEntity } from './coupon-brand-mapping.entity';
import { CouponCategoryMappingEntity } from './coupon-category-mapping.entity';
import { CouponProductMappingEntity } from './coupon-product-mapping.entity';

@Entity('coupons')
export class CouponEntity extends BaseEntity {
  @Index()
  @Column({ name: 'coupon_type', type: 'varchar', length: 100 })
  couponType!: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ name: 'same_user_limit', type: 'integer', nullable: true })
  sameUserLimit!: number | null;

  @Index()
  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: CouponDiscountType,
    enumName: 'coupons_discount_type_enum',
  })
  discountType!: CouponDiscountType;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 12, scale: 2 })
  discountAmount!: string;

  @Column({ name: 'min_purchase', type: 'decimal', precision: 12, scale: 2, default: 0 })
  minPurchase!: string;

  @Column({ name: 'max_discount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxDiscount!: string | null;

  @Column({ name: 'start_date', type: 'timestamptz' })
  startDate!: Date;

  @Column({ name: 'expiry_date', type: 'timestamptz' })
  expiryDate!: Date;

  @Index()
  @Column({
    name: 'applicability_scope',
    type: 'enum',
    enum: CouponApplicabilityScope,
    enumName: 'coupons_applicability_scope_enum',
    default: CouponApplicabilityScope.ALL,
  })
  applicabilityScope!: CouponApplicabilityScope;

  @Index()
  @Column({
    type: 'enum',
    enum: MasterStatus,
    enumName: 'brands_status_enum',
    default: MasterStatus.ACTIVE,
  })
  status!: MasterStatus;

  @OneToMany(() => CouponCategoryMappingEntity, (mapping) => mapping.coupon)
  categoryMappings!: CouponCategoryMappingEntity[];

  @OneToMany(() => CouponProductMappingEntity, (mapping) => mapping.coupon)
  productMappings!: CouponProductMappingEntity[];

  @OneToMany(() => CouponBrandMappingEntity, (mapping) => mapping.coupon)
  brandMappings!: CouponBrandMappingEntity[];
}
