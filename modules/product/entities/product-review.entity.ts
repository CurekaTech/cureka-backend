import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

@Entity('product_reviews')
@Index('IDX_product_reviews_product_status', ['productId', 'status'])
@Index('IDX_product_reviews_variant_status', ['variantId', 'status'])
export class ProductReviewEntity extends BaseEntity {
  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Index()
  @Column({ name: 'product_ref_id', type: 'varchar', length: 16 })
  productRefId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId!: string | null;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariantEntity | null;

  @Column({ name: 'variant_sku', type: 'varchar', length: 100, nullable: true })
  variantSku!: string | null;

  @Index()
  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'customer_name', type: 'varchar', length: 200 })
  customerName!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  /** Short title. Shopper submissions always set this; sheet imports may leave it null. */
  @Column({ type: 'text', nullable: true })
  review!: string | null;

  @Column({ name: 'review_description', type: 'text', nullable: true })
  reviewDescription!: string | null;

  @Column({ name: 'customer_age', type: 'text', nullable: true })
  customerAge!: string | null;

  @Column({ name: 'customer_location', type: 'text', nullable: true })
  customerLocation!: string | null;

  @Column({ name: 'import_key', type: 'varchar', length: 64, nullable: true, unique: true })
  importKey!: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: ProductReviewStatus,
    enumName: 'product_reviews_status_enum',
    default: ProductReviewStatus.PENDING,
  })
  status!: ProductReviewStatus;

  @Column({ name: 'moderated_by', type: 'varchar', length: 255, nullable: true })
  moderatedBy!: string | null;

  @Column({ name: 'moderated_at', type: 'timestamptz', nullable: true })
  moderatedAt!: Date | null;
}
