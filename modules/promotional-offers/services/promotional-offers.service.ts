import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { AuditService } from '@modules/master/services/audit.service';
import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
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
import {
  assertCheckoutCodeAvailable,
  assertPromotionalCodeShape,
  normalizeCheckoutCode,
} from '../utils/checkout-code-namespace.util';
import { assertIdList, readOfferScope } from '../utils/offer-scope.util';

@Injectable()
export class PromotionalOffersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly offersRepository: PromotionalOffersRepository,
    private readonly reservationsRepository: PromotionalOfferReservationsRepository,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePromotionalOfferDto, actor: string) {
    const code = normalizeCheckoutCode(dto.code);
    assertPromotionalCodeShape(code);
    if ((dto.status ?? MasterStatus.INACTIVE) === MasterStatus.ACTIVE && !code) {
      throw new BadRequestException('An active offer requires a code');
    }
    if ((dto.status ?? MasterStatus.INACTIVE) === MasterStatus.ACTIVE && new Date(dto.expiryDate) <= new Date()) {
      throw new BadRequestException('An active offer requires an expiry date and time in the future');
    }
    const targets = await this.validate(dto);
    const refId = await generateUniqueRefId('PO', async (candidate) => {
      const existing = await this.offersRepository.findByRefId(candidate);
      return Boolean(existing);
    });
    const created = await this.dataSource.transaction(async (manager) => {
      await assertCheckoutCodeAvailable(manager, code);
      const offer = await this.offersRepository.create(
        {
          refId,
          name: dto.name.trim(),
          code,
          internalDescription: dto.internalDescription?.trim() || null,
          customerMessage: dto.customerMessage.trim(),
          offerType: dto.offerType,
          status: dto.status ?? MasterStatus.INACTIVE,
          startDate: new Date(dto.startDate),
          expiryDate: new Date(dto.expiryDate),
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
    return this.withScopeLabels(this.toResponse(created!));
  }

  async findAll(query: PromotionalOfferListQueryDto) {
    await this.offersRepository.deactivateExpired();
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
    await this.offersRepository.deactivateExpired();
    const offer = await this.offersRepository.findByRefId(refId);
    if (!offer) throw new NotFoundException('Promotional offer not found');
    return this.withScopeLabels(this.toResponse(offer));
  }

  async update(refId: string, dto: CreatePromotionalOfferDto, actor: string) {
    const existing = await this.offersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Promotional offer not found');
    const reservations = await this.reservationsRepository.countByOffer(existing.id);
    if (reservations > 0 && dto.offerType !== existing.offerType) {
      throw new ConflictException('Offer type cannot change after a reservation exists');
    }
    const code = normalizeCheckoutCode(dto.code);
    assertPromotionalCodeShape(code);
    const nextStatus = dto.status ?? existing.status;
    if (nextStatus === MasterStatus.ACTIVE && !code) {
      throw new BadRequestException('An active offer requires a code');
    }
    if (nextStatus === MasterStatus.ACTIVE && new Date(dto.expiryDate) <= new Date()) {
      throw new BadRequestException('An active offer requires an expiry date and time in the future');
    }
    const targets = await this.validate(dto);
    await this.dataSource.transaction(async (manager) => {
      await assertCheckoutCodeAvailable(manager, code, { offerId: existing.id });
      await manager.getRepository(PromotionalOfferTargetEntity).delete({ offerId: existing.id });
      await manager.getRepository(PromotionalOfferEntity).update(
        { id: existing.id },
        {
          name: dto.name.trim(),
          code,
          internalDescription: dto.internalDescription?.trim() || null,
          customerMessage: dto.customerMessage.trim(),
          offerType: dto.offerType,
          status: nextStatus,
          startDate: new Date(dto.startDate),
          expiryDate: new Date(dto.expiryDate),
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
    return this.withScopeLabels(this.toResponse(updated!));
  }

  async updateStatus(refId: string, dto: UpdatePromotionalOfferStatusDto, actor: string) {
    await this.offersRepository.deactivateExpired();
    const existing = await this.offersRepository.findByRefId(refId);
    if (!existing) throw new NotFoundException('Promotional offer not found');
    if (dto.status === MasterStatus.ACTIVE && !existing.code) {
      throw new BadRequestException('An active offer requires a code');
    }
    if (dto.status === MasterStatus.ACTIVE && existing.expiryDate <= new Date()) {
      throw new BadRequestException('Cannot activate an expired offer. Extend the expiry date first.');
    }
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
    dto.config = dto.config ?? {};
    const scope = await this.assertScope(dto.config);
    this.validateConfig(dto, scope);
    const variants = [];
    const seen = new Set<string>();
    for (const target of dto.targets) {
      const key = `${target.role}:${target.variantId}`;
      if (seen.has(key)) {
        throw new BadRequestException('Each variant can only be selected once for the same role');
      }
      seen.add(key);
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

  private validateConfig(dto: CreatePromotionalOfferDto, scope: { brandIds: string[]; categoryIds: string[] }): void {
    const config = dto.config ?? {};
    if (dto.offerType === PromotionalOfferType.GIFT_ON_CART_VALUE) {
      this.assertGiftConfig(dto, config);
    }
    if (dto.offerType === PromotionalOfferType.BOGO) {
      const qualifying = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.QUALIFYING);
      if (!qualifying.length && !scope.brandIds.length && !scope.categoryIds.length) {
        throw new BadRequestException('BOGO requires at least one qualifying variant, brand, or category');
      }
      if (String(config['rewardPricing'] ?? '') !== RewardPricing.FREE) {
        throw new BadRequestException('BOGO reward price must be free');
      }
      if (Number(config['qualifyingQuantity']) < 1) {
        throw new BadRequestException('BOGO buy quantity must be at least 1');
      }
      if (Number(config['rewardQuantity']) !== 1) {
        throw new BadRequestException('BOGO reward quantity must be 1');
      }
      if (!(Number(config['maxRewardQuantity']) >= 1)) {
        throw new BadRequestException('BOGO max reward quantity must be at least 1');
      }
      config['rewardPricing'] = RewardPricing.FREE;
      config['rewardQuantity'] = 1;
      config['rewardDiscountValue'] = 0;
    }
    if (dto.offerType === PromotionalOfferType.BUY_X_GET_Y) {
      this.assertBuyXGetYConfig(dto, config, scope);
      this.assertRewardPricing(config);
    }
    if (dto.offerType === PromotionalOfferType.BUY_MORE_SAVE_MORE) {
      const tiers = Array.isArray(config['tiers']) ? config['tiers'] : [];
      if (!tiers.length) throw new BadRequestException('Buy More Save More requires at least one tier');
      const quantities = new Set<number>();
      for (const tier of tiers as Array<{ minQuantity?: number; discountType?: string; discountValue?: number }>) {
        const minQuantity = Number(tier.minQuantity);
        if (quantities.has(minQuantity)) throw new BadRequestException('Tier quantities must be unique');
        quantities.add(minQuantity);
        const discountType = String(tier.discountType ?? 'percentage');
        if (discountType !== 'percentage' && discountType !== 'fixed') {
          throw new BadRequestException('Tier discount type must be percentage or fixed');
        }
        if (minQuantity < 2 || Number(tier.discountValue) <= 0) {
          throw new BadRequestException('Each tier needs a minimum quantity of at least 2 and a positive discount');
        }
        if (discountType === 'percentage' && Number(tier.discountValue) > 100) {
          throw new BadRequestException('Percentage tier discount cannot exceed 100');
        }
      }
      if (
        !dto.targets.some((target) => target.role === PromotionalOfferTargetRole.TIER_GROUP) &&
        !scope.brandIds.length &&
        !scope.categoryIds.length
      ) {
        throw new BadRequestException('Buy More Save More requires a tier group, brand, or category');
      }
    }
  }

  private assertGiftConfig(dto: CreatePromotionalOfferDto, config: Record<string, unknown>): void {
    const configured = Array.isArray(config['gifts']) ? config['gifts'] : null;
    if (!configured) {
      const gifts = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.GIFT);
      if (gifts.length !== 1) throw new BadRequestException('A cart-value gift requires exactly one gift target');
      if (Number(config['threshold']) <= 0) throw new BadRequestException('Gift threshold must be greater than zero');
      return;
    }
    if (!configured.length) throw new BadRequestException('Add at least one cart-value gift');
    const thresholds = new Set<number>();
    const variants = new Set<string>();
    for (const gift of configured as Array<{ threshold?: number; variantId?: string }>) {
      const threshold = Number(gift.threshold);
      const variantId = String(gift.variantId ?? '');
      if (!(threshold > 0)) throw new BadRequestException('Each gift threshold must be greater than zero');
      if (thresholds.has(threshold)) throw new BadRequestException('Gift thresholds must be unique');
      thresholds.add(threshold);
      if (!variantId || variants.has(variantId)) {
        throw new BadRequestException('Each gift combination needs its own variant');
      }
      variants.add(variantId);
      const listed = dto.targets.some(
        (target) => target.role === PromotionalOfferTargetRole.GIFT && target.variantId === variantId,
      );
      if (!listed) throw new BadRequestException('Each gift combination must include its gift variant');
    }
  }

  private assertBuyXGetYConfig(
    dto: CreatePromotionalOfferDto,
    config: Record<string, unknown>,
    scope: { brandIds: string[]; categoryIds: string[] },
  ): void {
    const combinations = Array.isArray(config['combinations']) ? config['combinations'] : null;
    if (!combinations) {
      const qualifying = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.QUALIFYING);
      const rewards = dto.targets.filter((target) => target.role === PromotionalOfferTargetRole.REWARD);
      if (!qualifying.length || rewards.length !== 1) {
        throw new BadRequestException('Buy X Get Y requires qualifying targets and one reward target');
      }
      return;
    }
    if (!combinations.length) throw new BadRequestException('Add at least one Buy X Get Y combination');
    for (const combination of combinations as Array<{
      qualifying?: Array<{ variantId?: string; quantity?: number }>;
      qualifyingQuantity?: number;
      rewardVariantId?: string;
      rewardQuantity?: number;
    }>) {
      const qualifying = Array.isArray(combination.qualifying) ? combination.qualifying : [];
      const scoped = scope.brandIds.length > 0 || scope.categoryIds.length > 0;
      if (!qualifying.length && !(scoped && Number(combination.qualifyingQuantity) >= 1)) {
        throw new BadRequestException('Each combination needs at least one buy variant, or a brand or category');
      }
      const seen = new Set<string>();
      for (const row of qualifying) {
        const variantId = String(row.variantId ?? '');
        if (!variantId || seen.has(variantId)) {
          throw new BadRequestException('Each combination needs unique buy variants');
        }
        seen.add(variantId);
        if (Number(row.quantity) < 1) throw new BadRequestException('Buy quantity must be at least 1');
        const listed = dto.targets.some(
          (target) => target.role === PromotionalOfferTargetRole.QUALIFYING && target.variantId === variantId,
        );
        if (!listed) throw new BadRequestException('Each buy variant must be included on the offer');
      }
      const rewardVariantId = String(combination.rewardVariantId ?? '');
      if (!rewardVariantId || Number(combination.rewardQuantity) < 1) {
        throw new BadRequestException('Each combination needs a reward variant and quantity');
      }
      const rewardListed = dto.targets.some(
        (target) => target.role === PromotionalOfferTargetRole.REWARD && target.variantId === rewardVariantId,
      );
      if (!rewardListed) throw new BadRequestException('Each reward variant must be included on the offer');
    }
  }

  private targetVariantLabel(target: {
    variant?: { sku?: string | null; displayName?: string | null; product?: { name?: string | null } | null } | null;
  }): string | null {
    const variant = target.variant;
    if (!variant) return null;
    const name = String(variant.displayName || variant.product?.name || '').trim();
    const sku = String(variant.sku || '').trim();
    if (name && sku) return `${name} (${sku})`;
    return name || sku || null;
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
    code: string | null;
    usageLimit: number | null;
    sameUserLimit: number | null;
    config: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
    targets?: Array<{
      role: PromotionalOfferTargetRole;
      variantId: string;
      productId: string;
      quantity: number | null;
      variant?: { sku?: string | null; displayName?: string | null; product?: { name?: string | null } | null } | null;
    }>;
  }) {
    const now = new Date();
    let derivedStatus = 'inactive';
    if (offer.status === MasterStatus.ACTIVE && now < offer.startDate) derivedStatus = 'scheduled';
    else if (offer.status === MasterStatus.ACTIVE && now >= offer.expiryDate) derivedStatus = 'expired';
    else if (offer.status === MasterStatus.ACTIVE) derivedStatus = 'live';
    const effectiveStatus =
      derivedStatus === 'expired' ? MasterStatus.INACTIVE : offer.status;
    return {
      id: offer.id,
      refId: offer.refId,
      name: offer.name,
      internalDescription: offer.internalDescription,
      customerMessage: offer.customerMessage,
      offerType: offer.offerType,
      status: effectiveStatus,
      derivedStatus,
      startDate: offer.startDate,
      expiryDate: offer.expiryDate,
      code: offer.code,
      usageLimit: offer.usageLimit,
      sameUserLimit: offer.sameUserLimit,
      config: offer.config,
      targets: (offer.targets ?? []).map((target) => ({
        role: target.role,
        variantId: target.variantId,
        productId: target.productId,
        quantity: target.quantity,
        variantLabel: this.targetVariantLabel(target),
      })),
      createdAt: offer.createdAt,
      updatedAt: offer.updatedAt,
    };
  }

  private async assertScope(config: Record<string, unknown>) {
    let brandIds: string[] = [];
    let categoryIds: string[] = [];
    try {
      brandIds = assertIdList(config.brandIds, 'Brands');
      categoryIds = assertIdList(config.categoryIds, 'Categories');
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid offer scope');
    }
    config.brandIds = brandIds;
    config.categoryIds = categoryIds;
    if (brandIds.length) {
      const rows = await this.dataSource.getRepository(BrandEntity).find({ where: { id: In(brandIds) } });
      const active = new Set(rows.filter((row) => row.status === MasterStatus.ACTIVE).map((row) => row.id));
      if (brandIds.some((id) => !active.has(id))) {
        throw new BadRequestException('One or more brands are missing or inactive');
      }
    }
    if (categoryIds.length) {
      const rows = await this.dataSource.getRepository(CategoryEntity).find({ where: { id: In(categoryIds) } });
      const active = new Set(rows.filter((row) => row.status === MasterStatus.ACTIVE).map((row) => row.id));
      if (categoryIds.some((id) => !active.has(id))) {
        throw new BadRequestException('One or more categories are missing or inactive');
      }
    }
    return { brandIds, categoryIds };
  }

  private async withScopeLabels<T extends { config: Record<string, unknown> }>(response: T) {
    const { brandIds, categoryIds } = readOfferScope(response.config);
    const [brandRows, categoryRows] = await Promise.all([
      brandIds.length ? this.dataSource.getRepository(BrandEntity).find({ where: { id: In(brandIds) } }) : Promise.resolve([]),
      categoryIds.length
        ? this.dataSource.getRepository(CategoryEntity).find({ where: { id: In(categoryIds) } })
        : Promise.resolve([]),
    ]);
    const brandNames = new Map(brandRows.map((row) => [row.id, row.name]));
    const categoriesById = new Map(categoryRows.map((row) => [row.id, row]));
    return {
      ...response,
      brands: brandIds.map((id) => ({ id, name: brandNames.get(id) ?? id })),
      categories: categoryIds.map((id) => {
        const category = categoriesById.get(id);
        return {
          id,
          name: category?.name ?? id,
          hierarchyLevel: category?.hierarchyLevel ?? null,
        };
      }),
    };
  }
}
