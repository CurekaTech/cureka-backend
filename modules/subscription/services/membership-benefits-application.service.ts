import { Injectable } from '@nestjs/common';
import { MembershipBenefitType } from '../enums/membership-benefit-type.enum';
import { MembershipBenefitValueType } from '../enums/membership-benefit-value-type.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipStatus } from '../enums/membership-status.enum';
import { MembershipBenefitsRepository } from '../repositories/membership-benefits.repository';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';
import { UserMembershipsRepository } from '../repositories/user-memberships.repository';

export type MemberDiscount = {
  valueType: 'PERCENTAGE' | 'FLAT';
  value: string;
} | null;

@Injectable()
export class MembershipBenefitsApplicationService {
  constructor(
    private readonly userMembershipsRepository: UserMembershipsRepository,
    private readonly plansRepository: MembershipPlansRepository,
    private readonly benefitsRepository: MembershipBenefitsRepository,
  ) {}

  async getActiveBenefits(userId: string) {
    const membership = await this.userMembershipsRepository.findActiveByUserId(userId);
    if (!membership) return [];
    if (
      ![
        MembershipStatus.ACTIVE,
        MembershipStatus.RENEWAL_PAYMENT_PENDING,
        MembershipStatus.PAST_DUE,
      ].includes(membership.status)
    ) {
      return [];
    }

    const benefits = await this.benefitsRepository.findByPlanId(membership.membershipPlanId);
    return benefits.filter((b) => b.status === MembershipPlanStatus.ACTIVE);
  }

  async getMemberDiscount(userId: string): Promise<MemberDiscount> {
    const benefits = await this.getActiveBenefits(userId);
    const discount = benefits.find((b) => b.benefitType === MembershipBenefitType.MEMBER_DISCOUNT);
    if (!discount || discount.valueType === MembershipBenefitValueType.NONE) return null;
    if (discount.valueType === MembershipBenefitValueType.FLAT) {
      return { valueType: 'FLAT', value: discount.value ?? '0' };
    }
    return { valueType: 'PERCENTAGE', value: discount.value ?? '0' };
  }

  async hasFreeShipping(userId: string): Promise<boolean> {
    const benefits = await this.getActiveBenefits(userId);
    return benefits.some((b) => b.benefitType === MembershipBenefitType.FREE_SHIPPING);
  }
}
