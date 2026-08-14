import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, Unique } from 'typeorm';
import { MembershipPaymentStatus } from '../enums/membership-payment-status.enum';

@Entity('membership_payments')
@Unique('UQ_membership_payments_billing_cycle', ['userMembershipId', 'billingCycleRef'])
export class MembershipPaymentEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_membership_id', type: 'uuid' })
  userMembershipId!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index()
  @Column({ name: 'membership_plan_id', type: 'uuid' })
  membershipPlanId!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({ name: 'billing_cycle_ref', type: 'varchar', length: 64 })
  billingCycleRef!: string;

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
    enum: MembershipPaymentStatus,
    enumName: 'membership_payment_status_enum',
    default: MembershipPaymentStatus.PENDING,
  })
  status!: MembershipPaymentStatus;

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
}
