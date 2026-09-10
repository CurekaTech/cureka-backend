import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';

@Entity('subscription_mandates')
export class SubscriptionMandateEntity extends BaseEntity {
  @Index()
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: SubscriptionMandateProvider,
    enumName: 'subscription_mandate_provider_enum',
  })
  provider!: SubscriptionMandateProvider;

  @Column({
    type: 'enum',
    enum: SubscriptionMandateStatus,
    enumName: 'subscription_mandate_status_enum',
    default: SubscriptionMandateStatus.PENDING,
  })
  status!: SubscriptionMandateStatus;

  @Column({ name: 'max_amount', type: 'decimal', precision: 12, scale: 2 })
  maxAmount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({ name: 'gateway_customer_id', type: 'varchar', length: 255, nullable: true })
  gatewayCustomerId!: string | null;

  @Column({ name: 'gateway_mandate_id', type: 'varchar', length: 255, nullable: true })
  gatewayMandateId!: string | null;

  @Column({ name: 'gateway_subscription_id', type: 'varchar', length: 255, nullable: true })
  gatewaySubscriptionId!: string | null;

  @Column({ name: 'authorization_order_id', type: 'varchar', length: 255, nullable: true })
  authorizationOrderId!: string | null;

  @Column({ name: 'authorization_payment_id', type: 'varchar', length: 255, nullable: true })
  authorizationPaymentId!: string | null;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil!: Date | null;

  @Column({ name: 'authorized_at', type: 'timestamptz', nullable: true })
  authorizedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'consent_evidence', type: 'jsonb', nullable: true })
  consentEvidence!: Record<string, unknown> | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
