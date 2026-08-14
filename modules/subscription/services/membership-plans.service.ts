import { Injectable, NotFoundException } from '@nestjs/common';
import { generateUniqueRefId } from '@packages/common';
import {
  CreateMembershipPlanDto,
  UpdateMembershipPlanDto,
  AdminMembershipPlanQueryDto,
} from '../dto/membership.dto';
import { MembershipPlanEntity } from '../entities/membership-plan.entity';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { mapMembershipPlanToResponse } from '../mappers/membership.mapper';
import { MembershipPlansRepository } from '../repositories/membership-plans.repository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  async update(idOrRefId: string, dto: UpdateMembershipPlanDto, actor: string) {
    const existing = await this.resolveEntity(idOrRefId);
    await this.plansRepository.updateById(existing.id, {
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

    const updated = await this.plansRepository.findById(existing.id);
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

  async findByIdOrRefId(idOrRefId: string) {
    return mapMembershipPlanToResponse(await this.resolveEntity(idOrRefId));
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
      items: data.map(mapMembershipPlanToResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async softDelete(idOrRefId: string, actor: string) {
    const existing = await this.resolveEntity(idOrRefId);
    await this.plansRepository.softDeleteById(existing.id, actor);
    return { id: existing.id, refId: existing.refId };
  }

  findEntityById(id: string) {
    return this.plansRepository.findById(id);
  }

  findEntityByRefId(refId: string) {
    return this.plansRepository.findByRefId(refId);
  }

  async resolveEntity(idOrRefId: string): Promise<MembershipPlanEntity> {
    const plan = UUID_REGEX.test(idOrRefId)
      ? await this.plansRepository.findById(idOrRefId)
      : await this.plansRepository.findByRefId(idOrRefId);
    if (!plan) throw new NotFoundException('Membership plan not found');
    return plan;
  }

  async resolveId(idOrRefId: string): Promise<string> {
    return (await this.resolveEntity(idOrRefId)).id;
  }
}
