import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, Unique } from 'typeorm';
import { SubscriptionPaymentAttemptKind } from '../enums/subscription-payment-attempt-kind.enum';
import { SubscriptionPaymentStatus } from '../enums/subscription-payment-status.enum';

@Entity('subscription_payments')
@Unique('UQ_subscription_payments_billing_cycle', ['subscriptionId', 'billingCycleRef'])
export class SubscriptionPaymentEntity extends BaseEntity {
  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'billing_cycle_ref', type: 'varchar', length: 64 })
  billingCycleRef!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({ name: 'payment_gateway', type: 'varchar', length: 100, nullable: true })
  paymentGateway!: string | null;

  @Column({ name: 'gateway_order_id', type: 'varchar', length: 255, nullable: true })
  gatewayOrderId!: string | null;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 255, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ name: 'payment_link', type: 'varchar', length: 500, nullable: true })
  paymentLink!: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionPaymentStatus,
    enumName: 'subscription_payment_status_enum',
    default: SubscriptionPaymentStatus.PENDING,
  })
  status!: SubscriptionPaymentStatus;

  @Column({ name: 'billing_date', type: 'timestamptz' })
  billingDate!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Index()
  @Column({ name: 'billing_cycle_id', type: 'uuid', nullable: true })
  billingCycleId!: string | null;

  @Column({ name: 'order_id', type: 'uuid', nullable: true })
  orderId!: string | null;

  @Column({
    name: 'attempt_kind',
    type: 'enum',
    enum: SubscriptionPaymentAttemptKind,
    enumName: 'subscription_payment_attempt_kind_enum',
    default: SubscriptionPaymentAttemptKind.MANUAL_LINK,
  })
  attemptKind!: SubscriptionPaymentAttemptKind;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;
}
