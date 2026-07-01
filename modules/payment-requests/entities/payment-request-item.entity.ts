import { BaseEntity } from '@packages/database';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { PaymentRequestEntity } from './payment-request.entity';

@Entity('payment_request_items')
export class PaymentRequestItemEntity extends BaseEntity {
  @Index()
  @Column({ name: 'payment_request_id', type: 'uuid' })
  paymentRequestId!: string;

  @Index()
  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Index()
  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: string;

  @ManyToOne(() => PaymentRequestEntity, (request) => request.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_request_id' })
  paymentRequest?: PaymentRequestEntity;

  @ManyToOne(() => ProductEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @ManyToOne(() => ProductVariantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'variant_id' })
  variant?: ProductVariantEntity;
}
