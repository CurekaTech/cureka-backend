import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { AuditService } from '@modules/master/services/audit.service';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { CreatePromotionalOfferDto, PromotionalOfferListQueryDto, UpdatePromotionalOfferStatusDto } from '../dto/promotional-offer.dto';
import { PromotionalOfferEntity } from '../entities/promotional-offer.entity';
import { PromotionalOfferTargetEntity } from '../entities/promotional-offer-target.entity';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';
import { RewardPricing } from '../enums/reward-pricing.enum';
import { PromotionalOfferReservationsRepository } from '../repositories/promotional-offer-reservations.repository';
import { PromotionalOffersRepository } from '../repositories/promotional-offers.repository';

@Injectable()
export class PromotionalOffersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly offersRepository: PromotionalOffersRepository,
    private readonly reservationsRepository: PromotionalOfferReservationsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePromotionalOfferDto, actor: string) {
    const targets = await this.validate(dto);
    const refId = await generateUniqueRefId('PO', async (candidate) => {
      const existing = await this.offersRepository.findByRefId(candidate);
      return Boolean(existing);
    });
    const created = await this.dataSource.transaction(async (manager) => {
      const offer = await this.offersRepository.create(
        {
          refId,
          name: dto.name.trim(),
          internalDescription: dto.internalDescription?.trim() || null,
          customerMessage: dto.customerMessage.trim(),
          offerType: dto.offerType,
          status: dto.status ?? MasterStatus.INACTIVE,
          startDate: new Date(dto.startDate),
          expiryDate: new Date(dto.expiryDate),
          priority: dto.priority ?? 100,
          usageLimit: dto.usageLimit ?? null,
          sameUserLimit: dto.sameUserLimit ?? null,
          config: dto.config,
          createdBy: actor,
          updatedBy: actor,
        },
        manager,
      );
      for (const target of targets) {
        const targetRefId = await generateUniqueRefId('PT', async (candidate) => {
          const existing = await manager.getRepository(PromotionalOfferTargetEntity).findOne({ where: { refId: candidate } });
          return Boolean(existing);
        });
        await manager.getRepository(PromotionalOfferTargetEntity).save({
          refId: targetRefId,
          offerId: offer.id,
          role: target.role,
          productId: target.productId,
          variantId: target.variantId,
          quantity: target.quantity,
          createdBy: actor,
          updatedBy: actor,
        });
      }
      return this.offersRepository.findByRefId(offer.refId, manager);
    });
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PROMOTIONAL_OFFER,
      entityId: created!.id,
      entityRefId: created!.refId,
      action: 'created',
      performedBy: actor,
      details: { offerType: dto.offerType },
    });
    return this.toResponse(created!);
  }

  async findAll(query: PromotionalOfferListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { rows, total } = await this.offersRepository.search({
      page,
      limit,
      search: query.search,
      offerType: query.offerType,
      status: query.status,
    });
    return {
      data: rows.map((row) => this.toResponse(row)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findOne(refId: string) {
    const offer = await this.offersRepository.findByRefId(refId);
    if (!offer) throw new NotFoundException('Promotional offer not found');
    return this.toResponse(offer);
  }

  async update(refId: string, dto: CreatePromotionalOfferDto, actor: string) {
    const existing = await this.offersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Promotional offer not found');
    const reservations = await this.reservationsRepository.countByOffer(existing.id);
    if (reservations > 0 && dto.offerType !== existing.offerType) {
      throw new ConflictException('Offer type cannot change after a reservation exists');
    }
    const targets = await this.validate(dto);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(PromotionalOfferTargetEntity).delete({ offerId: existing.id });
      await manager.getRepository(PromotionalOfferEntity).update(
        { id: existing.id },
        {
          name: dto.name.trim(),
          internalDescription: dto.internalDescription?.trim() || null,
          customerMessage: dto.customerMessage.trim(),
          offerType: dto.offerType,
          status: dto.status ?? existing.status,
          startDate: new Date(dto.startDate),
          expiryDate: new Date(dto.expiryDate),
          priority: dto.priority ?? existing.priority,
          usageLimit: dto.usageLimit ?? null,
          sameUserLimit: dto.sameUserLimit ?? null,
          config: dto.config as never,
          updatedBy: actor,
        },
      );
      for (const target of targets) {
        const targetRefId = await generateUniqueRefId('PT', async (candidate) => {
          const found = await manager.getRepository(PromotionalOfferTargetEntity).findOne({ where: { refId: candidate } });
          return Boolean(found);
        });
        await manager.getRepository(PromotionalOfferTargetEntity).save({
          refId: targetRefId,
          offerId: existing.id,
          role: target.role,
          productId: target.productId,
          variantId: target.variantId,
          quantity: target.quantity,
          createdBy: actor,
          updatedBy: actor,
        });
      }
    });
    const updated = await this.offersRepository.findByRefId(refId);
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PROMOTIONAL_OFFER,
      entityId: existing.id,
      entityRefId: refId,
      action: 'updated',
      performedBy: actor,
      details: { offerType: dto.offerType },
    });
    return this.toResponse(updated!);
  }

  async updateStatus(refId: string, dto: UpdatePromotionalOfferStatusDto, actor: string) {
    const existing = await this.offersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Promotional offer not found');
    await this.dataSource.getRepository(PromotionalOfferEntity).update(
      { id: existing.id },
      { status: dto.status, updatedBy: actor },
    );
    await this.auditService.recordWrite({
      entityType: AuditEntityType.PROMOTIONAL_OFFER,
      entityId: existing.id,
      entityRefId: refId,
      action: 'status',
      performedBy: actor,
      details: { status: dto.status },
    });
    return this.findOne(refId);
  }

  async remove(refId: string) {
    const existing = await this.offersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Promotional offer not found');
    const reservations = await this.reservationsRepository.countByOffer(existing.id);
    if (reservations > 0) throw new ConflictException('Offer is referenced by a reservation or order');
    await this.dataSource.getRepository(PromotionalOfferEntity).softDelete({ id: existing.id });
  }

  private async validate(dto: CreatePromotionalOfferDto) {
    if (new Date(dto.expiryDate) <= new Date(dto.startDate)) {
      throw new BadRequestException('Expiry must be after the start date');
    }
    this.validateConfig(dto);
    const variants = [];
    for (const target of dto.targets) {
      const variant = await this.dataSource.getRepository(ProductVariantEntity).findOne({
        where: { id: target.variantId },
        relations: { product: true },
      });
      if (!variant || variant.deletedAt || variant.status !== VariantStatus.ACTIVE || variant.product?.status !== ProductStatus.PUBLISHED) {
        throw new BadRequestException(`Variant ${target.variantId} is missing, inactive, or unpublished`);
      }
      variants.push({
        role: target.role,
        productId: variant.productId,
        variantId: variant.id,
        quantity: target.quantity ?? null,
      });
    }
    return variants;
  }

  private validateConfig(dto: CreatePromotionalOfferDto): void {
    const config = dto.config ?? {};
    if (dto.offerType === PromotionalOfferType.GIFT_ON_CART_VALUE) {
      const gifts = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.GIFT);
      if (gifts.length !== 1) throw new BadRequestException('A cart-value gift requires exactly one gift target');
      if (Number(config['threshold']) <= 0) throw new BadRequestException('Gift threshold must be greater than zero');
    }
    if (dto.offerType === PromotionalOfferType.BOGO) {
      if (dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.QUALIFYING).length !== 1) {
        throw new BadRequestException('BOGO requires one qualifying variant');
      }
      this.assertRewardPricing(config);
      if (Number(config['qualifyingQuantity']) < 1 || Number(config['rewardQuantity']) < 1) {
        throw new BadRequestException('BOGO quantities must be at least 1');
      }
    }
    if (dto.offerType === PromotionalOfferType.BUY_X_GET_Y) {
      const qualifying = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.QUALIFYING);
      const rewards = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.REWARD);
      if (!qualifying.length || rewards.length !== 1) {
        throw new BadRequestException('Buy X Get Y requires qualifying targets and one reward target');
      }
      this.assertRewardPricing(config);
    }
    if (dto.offerType === PromotionalOfferType.BUY_MORE_SAVE_MORE) {
      const tiers = Array.isArray(config['tiers']) ? config['tiers'] : [];
      if (!tiers.length) throw new BadRequestException('Buy More Save More requires at least one tier');
      const quantities = new Set<number>();
      for (const tier of tiers as Array<{ minQuantity?: number; discountValue?: number }>) {
        const minQuantity = Number(tier.minQuantity);
        if (quantities.has(minQuantity)) throw new BadRequestException('Tier quantities must be unique');
        quantities.add(minQuantity);
        if (minQuantity < 1 || Number(tier.discountValue) <= 0) {
          throw new BadRequestException('Each tier needs a positive quantity and discount');
        }
      }
      if (!dto.targets.some((target) => target.role === PromotionalOfferTargetRole.TIER_GROUP)) {
        throw new BadRequestException('Buy More Save More requires a tier group');
      }
    }
  }

  private assertRewardPricing(config: Record<string, unknown>): void {
    const pricing = String(config['rewardPricing'] ?? '');
    if (![RewardPricing.FREE, RewardPricing.PERCENTAGE, RewardPricing.FIXED].includes(pricing as RewardPricing)) {
      throw new BadRequestException('Reward pricing must be free, percentage, or fixed');
    }
    if (pricing === RewardPricing.PERCENTAGE && Number(config['rewardDiscountValue']) > 100) {
      throw new BadRequestException('Percentage reward discount cannot exceed 100');
    }
  }

  private toResponse(offer: {
    id: string;
    refId: string;
    name: string;
    internalDescription: string | null;
    customerMessage: string;
    offerType: PromotionalOfferType;
    status: MasterStatus;
    startDate: Date;
    expiryDate: Date;
    priority: number;
    usageLimit: number | null;
    sameUserLimit: number | null;
    config: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    targets?: Array<{ role: PromotionalOfferTargetRole; variantId: string; productId: string; quantity: number | null }>;
  }) {
    const now = new Date();
    let derivedStatus = 'inactive';
    if (offer.status === MasterStatus.ACTIVE && now < offer.startDate) derivedStatus = 'scheduled';
    else if (offer.status === MasterStatus.ACTIVE && now > offer.expiryDate) derivedStatus = 'expired';
    else if (offer.status === MasterStatus.ACTIVE) derivedStatus = 'live';
    return {
      id: offer.id,
      refId: offer.refId,
      name: offer.name,
      internalDescription: offer.internalDescription,
      customerMessage: offer.customerMessage,
      offerType: offer.offerType,
      status: offer.status,
      derivedStatus,
      startDate: offer.startDate,
      expiryDate: offer.expiryDate,
      priority: offer.priority,
      usageLimit: offer.usageLimit,
      sameUserLimit: offer.sameUserLimit,
      config: offer.config,
      targets: (offer.targets ?? []).map((target) => ({
        role: target.role,
        variantId: target.variantId,
        productId: target.productId,
        quantity: target.quantity,
      })),
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }
}
