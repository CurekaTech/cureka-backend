import { Injectable } from '@nestjs/common';
import { MembershipBenefitType } from '../enums/membership-benefit-type.enum';
import { MembershipBenefitValueType } from '../enums/membership-benefit-value-type.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipStatus } from '../enums/membership-status.enum';
import { MembershipBenefitsRepository } from '../repositories/membership-benefits.repository';
import { UserMembershipsRepository } from '../repositories/user-memberships.repository';

export type MemberDiscount = {
  valueType: 'PERCENTAGE' | 'FLAT';
  value: string;
} | null;

export type FreeShippingBenefit = {
  enabled: true;
  minOrderValue: string | null;
} | null;

@Injectable()
export class MembershipBenefitsApplicationService {
  constructor(
    private readonly userMembershipsRepository: UserMembershipsRepository,
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

  async getFreeShipping(userId: string): Promise<FreeShippingBenefit> {
    const benefits = await this.getActiveBenefits(userId);
    const benefit = benefits.find((b) => b.benefitType === MembershipBenefitType.FREE_SHIPPING);
    if (!benefit) return null;

    const raw = benefit.metadata?.['minOrderValue'];
    const minOrderValue =
      raw === null || raw === undefined || raw === ''
        ? null
        : Number.isFinite(Number(raw))
          ? Number(raw).toFixed(2)
          : null;

    return { enabled: true, minOrderValue };
  }

  /**
   * When `orderAmount` is provided, returns true only if amount ≥ minOrderValue
   * (or minOrderValue is unset). Without amount, returns whether the member has
   * the free-shipping benefit at all.
   */
  async hasFreeShipping(userId: string, orderAmount?: number): Promise<boolean> {
    const info = await this.getFreeShipping(userId);
    if (!info) return false;
    if (info.minOrderValue == null) return true;
    if (orderAmount == null) return true;
    return Number(orderAmount) >= Number(info.minOrderValue);
  }
}
