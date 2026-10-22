import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalPageType } from '../enums/promotional-page-type.enum';
import { PromotionalPageSectionEntity } from './promotional-page-section.entity';
import { PromotionalPageTargetEntity } from './promotional-page-target.entity';

@Entity('promotional_pages')
@Index('IDX_promotional_pages_status', ['status'])
@Index('IDX_promotional_pages_schedule', ['startAt', 'endAt'])
export class PromotionalPageEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 280 })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'meta_title', type: 'varchar', length: 255, nullable: true })
  metaTitle!: string | null;

  @Column({ name: 'meta_description', type: 'varchar', length: 500, nullable: true })
  metaDescription!: string | null;

  @Column({
    type: 'enum',
    enum: PromotionalPageStatus,
    enumName: 'promotional_pages_status_enum',
    default: PromotionalPageStatus.DRAFT,
  })
  status!: PromotionalPageStatus;

  @Column({
    name: 'promotion_type',
    type: 'enum',
    enum: PromotionalPageType,
    enumName: 'promotional_pages_promotion_type_enum',
    default: PromotionalPageType.DEFAULT,
  })
  promotionType!: PromotionalPageType;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  /** Existing coupon. Pricing stays in the coupon/cart flow. */
  @Index('IDX_promotional_pages_coupon_id')
  @Column({ name: 'coupon_id', type: 'uuid', nullable: true })
  couponId!: string | null;

  @ManyToOne(() => CouponEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'coupon_id' })
  coupon?: CouponEntity | null;

  @OneToMany(() => PromotionalPageSectionEntity, (section) => section.page)
  sections?: PromotionalPageSectionEntity[];

  @OneToMany(() => PromotionalPageTargetEntity, (target) => target.page)
  targets?: PromotionalPageTargetEntity[];

  /** Filled by list queries. Not a column. */
  sectionCount?: number;
}
