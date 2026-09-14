import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, VersionColumn } from 'typeorm';
import { BaseEntity } from '@packages/database';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { IReturnAmountBreakdown } from '../interfaces/return-amount-breakdown.interface';
import { IReturnPickupAddress } from '../interfaces/return-pickup-address.interface';
import { ReturnRequestItemEntity } from './return-request-item.entity';
import { ReturnStatusHistoryEntity } from './return-status-history.entity';

@Entity('return_requests')
export class ReturnRequestEntity extends BaseEntity {
  /** Customer-facing identifier, e.g. `RET0000123`. */
  @Index('UQ_return_requests_return_number', { unique: true })
  @Column({ name: 'return_number', type: 'varchar', length: 30 })
  returnNumber!: string;

  @Index('IDX_return_requests_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Index('IDX_return_requests_order_number')
  @Column({ name: 'order_number', type: 'varchar', length: 30 })
  orderNumber!: string;

  @Index('IDX_return_requests_customer_id')
  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer?: UserEntity | null;

  @Index('IDX_return_requests_status')
  @Column({
    type: 'enum',
    enum: ReturnStatus,
    enumName: 'return_requests_status_enum',
    default: ReturnStatus.REQUESTED,
  })
  status!: ReturnStatus;

  @Index('IDX_return_requests_resolution')
  @Column({
    type: 'enum',
    enum: ReturnResolution,
    enumName: 'return_requests_resolution_enum',
  })
  resolution!: ReturnResolution;

  // ── Reason ────────────────────────────────────────────────────────────────

  @Index('IDX_return_requests_reason_id')
  @Column({ name: 'reason_id', type: 'uuid' })
  reasonId!: string;

  /** Denormalised so historical records stay readable if the reason is renamed. */
  @Column({ name: 'reason_code', type: 'varchar', length: 100 })
  reasonCode!: string;

  @Column({ name: 'reason_title', type: 'varchar', length: 255 })
  reasonTitle!: string;

  @Column({ name: 'customer_comments', type: 'text', nullable: true })
  customerComments!: string | null;

  @Column({ name: 'condition_declarations', type: 'jsonb', nullable: true })
  conditionDeclarations!: Record<string, boolean> | null;

  // ── Policy-derived operational flags, frozen at submission ────────────────

  @Column({ name: 'pickup_required', type: 'boolean', default: true })
  pickupRequired!: boolean;

  @Column({ name: 'qc_required', type: 'boolean', default: true })
  qcRequired!: boolean;

  @Column({ name: 'pickup_address', type: 'jsonb', nullable: true })
  pickupAddress!: IReturnPickupAddress | null;

  /** Set when the reason is the expired-product exception. */
  @Column({ name: 'is_expired_product_claim', type: 'boolean', default: false })
  isExpiredProductClaim!: boolean;

  // ── Delivery / window context, frozen at submission ───────────────────────

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'return_window_expires_at', type: 'timestamptz', nullable: true })
  returnWindowExpiresAt!: Date | null;

  // ── Origin ────────────────────────────────────────────────────────────────

  @Column({
    name: 'requested_by_type',
    type: 'enum',
    enum: ReturnRequestedByType,
    enumName: 'return_requests_requested_by_type_enum',
  })
  requestedByType!: ReturnRequestedByType;

  @Column({ name: 'requested_by_id', type: 'varchar', length: 64, nullable: true })
  requestedById!: string | null;

  @Column({ name: 'is_admin_initiated', type: 'boolean', default: false })
  isAdminInitiated!: boolean;

  @Column({ name: 'eligibility_overridden', type: 'boolean', default: false })
  eligibilityOverridden!: boolean;

  @Column({ name: 'override_reason', type: 'text', nullable: true })
  overrideReason!: string | null;

  @Column({ name: 'internal_justification', type: 'text', nullable: true })
  internalJustification!: string | null;

  @Column({ name: 'customer_visible_explanation', type: 'text', nullable: true })
  customerVisibleExplanation!: string | null;

  /** Snapshot of the eligibility evaluation that allowed this request. */
  @Column({ name: 'eligibility_snapshot', type: 'jsonb', nullable: true })
  eligibilitySnapshot!: Record<string, unknown> | null;

  // ── Assignment and review ─────────────────────────────────────────────────

  @Index('IDX_return_requests_assigned_to_user_id')
  @Column({ name: 'assigned_to_user_id', type: 'uuid', nullable: true })
  assignedToUserId!: string | null;

  @Column({ name: 'assigned_role_id', type: 'uuid', nullable: true })
  assignedRoleId!: string | null;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 64, nullable: true })
  reviewedBy!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'varchar', length: 64, nullable: true })
  approvedBy!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejected_by', type: 'varchar', length: 64, nullable: true })
  rejectedBy!: string | null;

  @Column({ name: 'rejected_at', type: 'timestamptz', nullable: true })
  rejectedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'information_requested_at', type: 'timestamptz', nullable: true })
  informationRequestedAt!: Date | null;

  @Column({ name: 'information_request_message', type: 'text', nullable: true })
  informationRequestMessage!: string | null;

  // ── Fulfilment milestones ─────────────────────────────────────────────────

  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt!: Date | null;

  @Column({ name: 'received_at_warehouse_at', type: 'timestamptz', nullable: true })
  receivedAtWarehouseAt!: Date | null;

  @Column({ name: 'qc_completed_at', type: 'timestamptz', nullable: true })
  qcCompletedAt!: Date | null;

  @Column({ name: 'no_pickup_approved', type: 'boolean', default: false })
  noPickupApproved!: boolean;

  @Column({ name: 'no_pickup_approved_by', type: 'varchar', length: 64, nullable: true })
  noPickupApprovedBy!: string | null;

  @Column({ name: 'inventory_restored', type: 'boolean', default: false })
  inventoryRestored!: boolean;

  // ── Money ─────────────────────────────────────────────────────────────────

  @Column({ name: 'estimated_refund_amount', type: 'decimal', precision: 12, scale: 2, default: 0 })
  estimatedRefundAmount!: string;

  @Column({
    name: 'approved_refund_amount',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  approvedRefundAmount!: string | null;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  /** Immutable audit trace of how the refundable amount was derived. */
  @Column({ name: 'amount_breakdown', type: 'jsonb', nullable: true })
  amountBreakdown!: IReturnAmountBreakdown | null;

  /**
   * Destination for the COD-paid portion. Prepaid money always returns to the
   * original gateway and never uses these fields.
   */
  @Column({
    name: 'refund_method',
    type: 'enum',
    enum: CodRefundMethod,
    enumName: 'return_requests_refund_method_enum',
    nullable: true,
  })
  refundMethod!: CodRefundMethod | null;

  @Column({ name: 'bank_account_holder_name', type: 'varchar', length: 150, nullable: true })
  bankAccountHolderName!: string | null;

  /** AES-256-GCM ciphertext. Never selected into list queries or logs. */
  @Column({ name: 'bank_account_number_encrypted', type: 'text', nullable: true })
  bankAccountNumberEncrypted!: string | null;

  @Column({ name: 'bank_account_number_last4', type: 'varchar', length: 4, nullable: true })
  bankAccountNumberLast4!: string | null;

  @Column({ name: 'bank_ifsc', type: 'varchar', length: 11, nullable: true })
  bankIfsc!: string | null;

  @Column({ name: 'bank_name', type: 'varchar', length: 150, nullable: true })
  bankName!: string | null;

  @Column({ name: 'bank_account_type', type: 'varchar', length: 20, nullable: true })
  bankAccountType!: string | null;

  @Column({ name: 'bank_details_submitted_at', type: 'timestamptz', nullable: true })
  bankDetailsSubmittedAt!: Date | null;

  /** True after return approval. Customer cannot edit without Finance reopening. */
  @Column({ name: 'bank_details_locked', type: 'boolean', default: false })
  bankDetailsLocked!: boolean;

  // ── Downstream linkage ────────────────────────────────────────────────────

  /** Unique when set — the idempotency guard against double refund creation. */
  @Index('UQ_return_requests_refund_request_id', { unique: true })
  @Column({ name: 'refund_request_id', type: 'uuid', nullable: true })
  refundRequestId!: string | null;

  @Column({ name: 'refund_linked_at', type: 'timestamptz', nullable: true })
  refundLinkedAt!: Date | null;

  @Index('UQ_return_requests_replacement_order_id', { unique: true })
  @Column({ name: 'replacement_order_id', type: 'uuid', nullable: true })
  replacementOrderId!: string | null;

  @Column({ name: 'replacement_linked_at', type: 'timestamptz', nullable: true })
  replacementLinkedAt!: Date | null;

  // ── Terminal timestamps ───────────────────────────────────────────────────

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'cancelled_by', type: 'varchar', length: 64, nullable: true })
  cancelledBy!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** Optimistic-concurrency guard for admin actions racing on one request. */
  @VersionColumn({ name: 'version' })
  version!: number;

  @OneToMany(() => ReturnRequestItemEntity, (item) => item.returnRequest, { cascade: false })
  items?: ReturnRequestItemEntity[];

  @OneToMany(() => ReturnStatusHistoryEntity, (history) => history.returnRequest)
  history?: ReturnStatusHistoryEntity[];
}
