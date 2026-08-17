import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import {
  CreateMembershipBenefitDto,
  UpdateMembershipBenefitDto,
  UpsertMembershipBenefitDto,
} from '../dto/membership.dto';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { mapMembershipBenefitToResponse } from '../mappers/membership.mapper';
import { MembershipBenefitsRepository } from '../repositories/membership-benefits.repository';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';

const buildBenefitMetadata = (
  dto: {
    metadata?: Record<string, unknown> | null;
    minOrderValue?: number | null;
  },
  existing?: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  const metadata: Record<string, unknown> = {
    ...(existing ?? {}),
    ...(dto.metadata ?? {}),
  };

  if (dto.minOrderValue !== undefined) {
    if (dto.minOrderValue == null) {
      delete metadata.minOrderValue;
    } else {
      metadata.minOrderValue = Number(Number(dto.minOrderValue).toFixed(2));
    }
  }

  return Object.keys(metadata).length ? metadata : null;
};

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
      metadata: buildBenefitMetadata(dto),
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

    const shouldPatchMetadata =
      dto.metadata !== undefined || dto.minOrderValue !== undefined;

    await this.benefitsRepository.updateById(benefitId, {
      ...(dto.benefitType !== undefined ? { benefitType: dto.benefitType } : {}),
      ...(dto.valueType !== undefined ? { valueType: dto.valueType } : {}),
      ...(dto.value !== undefined
        ? { value: dto.value != null ? Number(dto.value).toFixed(2) : null }
        : {}),
      ...(shouldPatchMetadata
        ? {
            metadata: buildBenefitMetadata(
              {
                metadata: dto.metadata,
                minOrderValue: dto.minOrderValue,
              },
              dto.metadata !== undefined ? null : existing.metadata,
            ),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      updatedBy: actor,
    });

    const updated = await this.benefitsRepository.findById(benefitId);
    if (!updated) throw new NotFoundException('Membership benefit not found after update');
    return mapMembershipBenefitToResponse(updated);
  }

  /**
   * Full sync for a plan:
   * - items with `id` → update (must belong to plan)
   * - items without `id` → create
   * - existing benefits missing from the array → soft-delete
   */
  async sync(planId: string, items: UpsertMembershipBenefitDto[], actor: string) {
    const plan = await this.plansRepository.findById(planId);
    if (!plan) throw new NotFoundException('Membership plan not found');

    const existing = await this.benefitsRepository.findByPlanId(planId);
    const existingById = new Map(existing.map((row) => [row.id, row]));
    const keptIds = new Set<string>();

    for (const [index, item] of items.entries()) {
      if (item.id) {
        const current = existingById.get(item.id);
        if (!current) {
          throw new BadRequestException(
            `benefits[${index}].id does not belong to this membership plan`,
          );
        }
        await this.benefitsRepository.updateById(item.id, {
          benefitType: item.benefitType,
          valueType: item.valueType,
          value: item.value != null ? Number(item.value).toFixed(2) : null,
          metadata: buildBenefitMetadata(item),
          status: item.status ?? MembershipPlanStatus.ACTIVE,
          sortOrder: item.sortOrder ?? index,
          updatedBy: actor,
        });
        keptIds.add(item.id);
        continue;
      }

      const refId = await generateUniqueRefId('mben', (c) =>
        this.benefitsRepository.existsByRefId(c),
      );
      const created = await this.benefitsRepository.create({
        refId,
        membershipPlanId: planId,
        benefitType: item.benefitType,
        valueType: item.valueType,
        value: item.value != null ? Number(item.value).toFixed(2) : null,
        metadata: buildBenefitMetadata(item),
        status: item.status ?? MembershipPlanStatus.ACTIVE,
        sortOrder: item.sortOrder ?? index,
        createdBy: actor,
        updatedBy: actor,
      });
      keptIds.add(created.id);
    }

    for (const row of existing) {
      if (!keptIds.has(row.id)) {
        await this.benefitsRepository.softDeleteById(row.id, actor);
      }
    }

    return this.listByPlan(planId);
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
