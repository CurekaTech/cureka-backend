import { BaseEntity } from '@packages/database';
import { Column, Entity, Index } from 'typeorm';
import { MembershipStatus } from '../enums/membership-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

@Entity('user_memberships')
export class UserMembershipEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'membership_plan_id', type: 'uuid' })
  membershipPlanId!: string;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    enumName: 'membership_status_enum',
    default: MembershipStatus.PENDING_PAYMENT,
  })
  status!: MembershipStatus;

  @Column({ name: 'start_date', type: 'timestamptz', nullable: true })
  startDate!: Date | null;

  @Column({ name: 'end_date', type: 'timestamptz', nullable: true })
  endDate!: Date | null;

  @Column({ name: 'next_billing_date', type: 'timestamptz', nullable: true })
  nextBillingDate!: Date | null;

  @Column({
    name: 'renewal_method',
    type: 'enum',
    enum: SubscriptionRenewalMethod,
    enumName: 'subscription_renewal_method_enum',
    default: SubscriptionRenewalMethod.PAYMENT_LINK,
  })
  renewalMethod!: SubscriptionRenewalMethod;

  @Column({ name: 'payment_gateway', type: 'varchar', length: 100, nullable: true })
  paymentGateway!: string | null;

  @Column({ name: 'gateway_customer_id', type: 'varchar', length: 255, nullable: true })
  gatewayCustomerId!: string | null;

  @Column({ name: 'gateway_subscription_id', type: 'varchar', length: 255, nullable: true })
  gatewaySubscriptionId!: string | null;

  @Column({ name: 'gateway_mandate_id', type: 'varchar', length: 255, nullable: true })
  gatewayMandateId!: string | null;

  @Column({ name: 'cancellation_date', type: 'timestamptz', nullable: true })
  cancellationDate!: Date | null;

  @Column({ name: 'cancellation_reason', type: 'text', nullable: true })
  cancellationReason!: string | null;

  @Column({ name: 'paused_at', type: 'timestamptz', nullable: true })
  pausedAt!: Date | null;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz', nullable: true })
  termsAcceptedAt!: Date | null;
}
