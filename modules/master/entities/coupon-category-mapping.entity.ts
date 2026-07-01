import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { CategoryEntity } from './category.entity';
import { CouponEntity } from './coupon.entity';

@Entity('coupon_categories')
export class CouponCategoryMappingEntity {
  @PrimaryColumn({ name: 'coupon_id', type: 'uuid' })
  couponId!: string;

  @PrimaryColumn({ name: 'category_id', type: 'uuid' })
  categoryId!: string;

  @ManyToOne(() => CouponEntity, (coupon) => coupon.categoryMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon!: CouponEntity;

  @Index()
  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category!: CategoryEntity;
}
