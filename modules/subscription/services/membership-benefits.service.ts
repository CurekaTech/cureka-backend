import { Injectable, NotFoundException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import { CreateMembershipBenefitDto, UpdateMembershipBenefitDto } from '../dto/membership.dto';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { mapMembershipBenefitToResponse } from '../mappers/membership.mapper';
import { MembershipBenefitsRepository } from '../repositories/membership-benefits.repository';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';

@Injectable()
export class MembershipBenefitsService {
  constructor(
    private readonly benefitsRepository: MembershipBenefitsRepository,
    private readonly plansRepository: MembershipPlansRepository,
  ) {}

  async create(planId: string, dto: CreateMembershipBenefitDto, actor: string) {
    const plan = await this.plansRepository.findById(planId);
    if (!plan) throw new NotFoundException('Membership plan not found');

    const refId = await generateUniqueRefId('mben', (c) => this.benefitsRepository.existsByRefId(c));
    const created = await this.benefitsRepository.create({
      refId,
      membershipPlanId: planId,
      benefitType: dto.benefitType,
      valueType: dto.valueType,
      value: dto.value != null ? Number(dto.value).toFixed(2) : null,
      metadata: dto.metadata ?? null,
      status: dto.status ?? MembershipPlanStatus.ACTIVE,
      sortOrder: dto.sortOrder ?? 0,
      createdBy: actor,
      updatedBy: actor,
    });
    return mapMembershipBenefitToResponse(created);
  }

  async update(benefitId: string, dto: UpdateMembershipBenefitDto, actor: string) {
    const existing = await this.benefitsRepository.findById(benefitId);
    if (!existing) throw new NotFoundException('Membership benefit not found');

    await this.benefitsRepository.updateById(benefitId, {
      ...(dto.benefitType !== undefined ? { benefitType: dto.benefitType } : {}),
      ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
      ...(dto.value !== undefined
        ? { value: dto.value != null ? Number(dto.value).toFixed(2) : null }
        : {}),
      ...(dto.metadata !== undefined ? { metadata: dto.metadata } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      updatedBy: actor,
    });

    const updated = await this.benefitsRepository.findById(benefitId);
    if (!updated) throw new NotFoundException('Membership benefit not found after update');
    return mapMembershipBenefitToResponse(updated);
  }

  async listByPlan(planId: string) {
    const plan = await this.plansRepository.findById(planId);
    if (!plan) throw new NotFoundException('Membership plan not found');
    const benefits = await this.benefitsRepository.findByPlanId(planId);
    return benefits.map(mapMembershipBenefitToResponse);
  }

  async softDelete(benefitId: string, actor: string) {
    const existing = await this.benefitsRepository.findById(benefitId);
    if (!existing) throw new NotFoundException('Membership benefit not found');
    await this.benefitsRepository.softDeleteById(benefitId, actor);
    return { id: benefitId };
  }
}
