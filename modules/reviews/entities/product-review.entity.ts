import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

@Entity('product_reviews')
@Index('IDX_product_reviews_product_status', ['productId', 'status'])
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
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 200 })
  customerName!: string;

  @Column({ type: 'smallint' })
  rating!: number;

  @Column({ type: 'text' })
  review!: string;

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
