import { Injectable, NotFoundException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import {
  CreateMembershipPlanDto,
  UpdateMembershipPlanDto,
  AdminMembershipPlanQueryDto,
} from '../dto/membership.dto';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { mapMembershipPlanToResponse } from '../mappers/membership.mapper';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';

@Injectable()
export class MembershipPlansService {
  constructor(private readonly plansRepository: MembershipPlansRepository) {}

  async create(dto: CreateMembershipPlanDto, actor: string) {
    const refId = await generateUniqueRefId('mplan', (c) => this.plansRepository.existsByRefId(c));
    const created = await this.plansRepository.create({
      refId,
      name: dto.name,
      description: dto.description ?? null,
      price: Number(dto.price).toFixed(2),
      currency: dto.currency ?? 'INR',
      billingCycle: dto.billingCycle,
      validityDays: dto.validityDays,
      renewalEnabled: dto.renewalEnabled ?? true,
      gracePeriodDays: dto.gracePeriodDays ?? 7,
      status: dto.status ?? MembershipPlanStatus.ACTIVE,
      sortOrder: dto.sortOrder ?? 0,
      renewalMethod: dto.renewalMethod ?? SubscriptionRenewalMethod.PAYMENT_LINK,
      createdBy: actor,
      updatedBy: actor,
    });
    const full = await this.plansRepository.findById(created.id);
    return mapMembershipPlanToResponse(full ?? created);
  }

  async update(id: string, dto: UpdateMembershipPlanDto, actor: string) {
    const existing = await this.plansRepository.findById(id);
    if (!existing) throw new NotFoundException('Membership plan not found');

    await this.plansRepository.updateById(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.price !== undefined ? { price: Number(dto.price).toFixed(2) } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.billingCycle !== undefined ? { billingCycle: dto.billingCycle } : {}),
      ...(dto.validityDays !== undefined ? { validityDays: dto.validityDays } : {}),
      ...(dto.renewalEnabled !== undefined ? { renewalEnabled: dto.renewalEnabled } : {}),
      ...(dto.gracePeriodDays !== undefined ? { gracePeriodDays: dto.gracePeriodDays } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.renewalMethod !== undefined ? { renewalMethod: dto.renewalMethod } : {}),
      updatedBy: actor,
    });

    const updated = await this.plansRepository.findById(id);
    if (!updated) throw new NotFoundException('Membership plan not found after update');
    return mapMembershipPlanToResponse(updated);
  }

  async findById(id: string) {
    const plan = await this.plansRepository.findById(id);
    if (!plan) throw new NotFoundException('Membership plan not found');
    return mapMembershipPlanToResponse(plan);
  }

  async findByRefId(refId: string) {
    const plan = await this.plansRepository.findByRefId(refId);
    if (!plan) throw new NotFoundException('Membership plan not found');
    return mapMembershipPlanToResponse(plan);
  }

  async listActive() {
    const plans = await this.plansRepository.findActivePlans();
    return plans.map(mapMembershipPlanToResponse);
  }

  async listAdmin(query: AdminMembershipPlanQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.plansRepository.findPaginated({
      page,
      limit,
      search: query.search,
      status: query.status,
    });
    return {
      data: data.map(mapMembershipPlanToResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async softDelete(id: string, actor: string) {
    const existing = await this.plansRepository.findById(id);
    if (!existing) throw new NotFoundException('Membership plan not found');
    await this.plansRepository.softDeleteById(id, actor);
    return { id };
  }

  findEntityById(id: string) {
    return this.plansRepository.findById(id);
  }

  findEntityByRefId(refId: string) {
    return this.plansRepository.findByRefId(refId);
  }
}
