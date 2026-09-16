import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, Unique } from 'typeorm';
import { SubscriptionBillingCycleStatus } from '../enums/subscription-billing-cycle-status.enum';

@Entity('subscription_billing_cycles')
@Unique('UQ_subscription_billing_cycles_subscription_ref', ['subscriptionId', 'billingCycleRef'])
export class SubscriptionBillingCycleEntity extends BaseEntity {
  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'billing_cycle_ref', type: 'varchar', length: 64 })
  billingCycleRef!: string;

  @Column({ name: 'sequence', type: 'int' })
  sequence!: number;

  @Column({
    type: 'enum',
    enum: SubscriptionBillingCycleStatus,
    enumName: 'subscription_billing_cycle_status_enum',
    default: SubscriptionBillingCycleStatus.SCHEDULED,
  })
  status!: SubscriptionBillingCycleStatus;

  @Column({ name: 'charge_date', type: 'timestamptz' })
  chargeDate!: Date;

  @Column({ name: 'estimated_delivery_date', type: 'timestamptz', nullable: true })
  estimatedDeliveryDate!: Date | null;

  @Column({ name: 'amount', type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({ name: 'pricing_snapshot', type: 'jsonb', nullable: true })
  pricingSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'skip_reason', type: 'varchar', length: 64, nullable: true })
  skipReason!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ name: 'notification_sent_at', type: 'timestamptz', nullable: true })
  notificationSentAt!: Date | null;

  @Column({ name: 'debit_earliest_at', type: 'timestamptz', nullable: true })
  debitEarliestAt!: Date | null;

  @Column({ name: 'processing_started_at', type: 'timestamptz', nullable: true })
  processingStartedAt!: Date | null;
}
