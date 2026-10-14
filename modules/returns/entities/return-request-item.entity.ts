import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { IOrderItemReturnPolicySnapshot } from '@modules/orders/interfaces/order-item-return-policy.interface';
import { ReturnRequestEntity } from './return-request.entity';

@Entity('return_request_items')
@Index('IDX_return_request_items_order_item_id', ['orderItemId'])
export class ReturnRequestItemEntity extends BaseEntity {
  @Index('IDX_return_request_items_return_request_id')
  @Column({ name: 'return_request_id', type: 'uuid' })
  returnRequestId!: string;

  @ManyToOne(() => ReturnRequestEntity, (request) => request.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'return_request_id' })
  returnRequest?: ReturnRequestEntity;

  @Column({ name: 'order_item_id', type: 'uuid' })
  orderItemId!: string;

  @ManyToOne(() => OrderItemEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem?: OrderItemEntity;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'variant_id', type: 'uuid' })
  variantId!: string;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ name: 'product_name', type: 'varchar', length: 500 })
  productName!: string;

  @Column({ name: 'variant_name', type: 'varchar', length: 500, nullable: true })
  variantName!: string | null;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: string;

  /** Net refundable value for this line after discount/coupon allocation. */
  @Column({ name: 'refundable_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  refundableAmount!: string;

  /**
   * The policy that applied to the source order item, copied again here so the
   * return record stays self-contained for audit.
   */
  @Column({ name: 'policy_snapshot', type: 'jsonb', nullable: true })
  policySnapshot!: IOrderItemReturnPolicySnapshot | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  // ── QC outcome ────────────────────────────────────────────────────────────

  @Column({ name: 'accepted_quantity', type: 'int', nullable: true })
  acceptedQuantity!: number | null;

  @Column({ name: 'rejected_quantity', type: 'int', nullable: true })
  rejectedQuantity!: number | null;

  @Column({ name: 'qc_rejection_reason', type: 'text', nullable: true })
  qcRejectionReason!: string | null;

  // ── Replacement selection ─────────────────────────────────────────────────

  /**
   * Customer's preferred replacement. Set at submit and never overwritten
   * when admin confirms a different variant.
   */
  @Column({ name: 'preferred_replacement_variant_id', type: 'uuid', nullable: true })
  preferredReplacementVariantId!: string | null;

  @Column({ name: 'preferred_replacement_sku', type: 'varchar', length: 100, nullable: true })
  preferredReplacementSku!: string | null;

  @Column({ name: 'preferred_replacement_product_name', type: 'varchar', length: 500, nullable: true })
  preferredReplacementProductName!: string | null;

  @Column({ name: 'preferred_replacement_variant_name', type: 'varchar', length: 500, nullable: true })
  preferredReplacementVariantName!: string | null;

  /**
   * Before admin confirmation this matches the preference when the customer sent one.
   * After confirmation it is the variant admin confirmed. The preference columns stay.
   */
  @Column({ name: 'replacement_variant_id', type: 'uuid', nullable: true })
  replacementVariantId!: string | null;

  /** Optional audit of which bundle component the customer said was damaged. */
  @Column({ name: 'affected_component_variant_id', type: 'uuid', nullable: true })
  affectedComponentVariantId!: string | null;

  @Column({ name: 'affected_component_sku', type: 'varchar', length: 100, nullable: true })
  affectedComponentSku!: string | null;

  @Column({ name: 'affected_component_name', type: 'varchar', length: 500, nullable: true })
  affectedComponentName!: string | null;

  @Column({ name: 'replacement_sku', type: 'varchar', length: 100, nullable: true })
  replacementSku!: string | null;

  /** Names snapshotted when admin confirms. Later catalogue renames do not change them. */
  @Column({ name: 'replacement_product_name', type: 'varchar', length: 500, nullable: true })
  replacementProductName!: string | null;

  @Column({ name: 'replacement_variant_name', type: 'varchar', length: 500, nullable: true })
  replacementVariantName!: string | null;
}
