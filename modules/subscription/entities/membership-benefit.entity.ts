import { BaseEntity } from '@packages/database';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { MembershipBenefitType } from '../enums/membership-benefit-type.enum';
import { MembershipBenefitValueType } from '../enums/membership-benefit-value-type.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipPlanEntity } from './membership-plan.entity';

@Entity('membership_benefits')
export class MembershipBenefitEntity extends BaseEntity {
  @Index()
  @Column({ name: 'membership_plan_id', type: 'uuid' })
  membershipPlanId!: string;

  @Column({
    name: 'benefit_type',
    type: 'enum',
    enum: MembershipBenefitType,
    enumName: 'membership_benefit_type_enum',
  })
  benefitType!: MembershipBenefitType;

  @Column({
    name: 'value_type',
    type: 'enum',
    enum: MembershipBenefitValueType,
    enumName: 'membership_benefit_value_type_enum',
  })
  valueType!: MembershipBenefitValueType;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: 0 })
  value!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({
    type: 'enum',
    enum: MembershipPlanStatus,
    enumName: 'membership_plan_status_enum',
    default: MembershipPlanStatus.ACTIVE,
  })
  status!: MembershipPlanStatus;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @ManyToOne(() => MembershipPlanEntity, (plan) => plan.benefits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'membership_plan_id' })
  membershipPlan?: MembershipPlanEntity;
}
