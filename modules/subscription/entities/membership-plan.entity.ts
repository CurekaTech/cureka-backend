import { BaseEntity } from '@packages/database';
import { Column, Entity, OneToMany } from 'typeorm';
import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { MembershipBenefitEntity } from './membership-benefit.entity';

@Entity('membership_plans')
export class MembershipPlanEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price!: string;

  @Column({ type: 'varchar', length: 5, default: 'INR' })
  currency!: string;

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: MembershipBillingCycle,
    enumName: 'membership_billing_cycle_enum',
  })
  billingCycle!: MembershipBillingCycle;

  @Column({ name: 'validity_days', type: 'int' })
  validityDays!: number;

  @Column({ name: 'renewal_enabled', type: 'boolean', default: true })
  renewalEnabled!: boolean;

  @Column({ name: 'grace_period_days', type: 'int', default: 7 })
  gracePeriodDays!: number;

  @Column({
    type: 'enum',
    enum: MembershipPlanStatus,
    enumName: 'membership_plan_status_enum',
    default: MembershipPlanStatus.ACTIVE,
  })
  status!: MembershipPlanStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({
    name: 'renewal_method',
    type: 'enum',
    enum: SubscriptionRenewalMethod,
    enumName: 'subscription_renewal_method_enum',
    default: SubscriptionRenewalMethod.PAYMENT_LINK,
  })
  renewalMethod!: SubscriptionRenewalMethod;

  @OneToMany(() => MembershipBenefitEntity, (benefit) => benefit.membershipPlan)
  benefits!: MembershipBenefitEntity[];
}
