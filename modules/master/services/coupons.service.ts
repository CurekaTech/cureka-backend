import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { CouponApplicabilityScope } from '../enums/coupon-applicability-scope.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { CouponDiscountType } from '../enums/coupon-discount-type.enum';
import { CreateCouponDto, UpdateCouponDto, UpdateCouponStatusDto } from '../dto/coupon.dto';
import { BrandEntity } from '../entities/brand.entity';
import { CategoryEntity } from '../entities/category.entity';
import { CouponEntity } from '../entities/coupon.entity';
import { ICoupon } from '../interfaces/coupon.interface';
import { mapCouponEntitiesToResponse, mapCouponEntityToResponse } from '../mappers/coupon.mapper';
import { CouponApplicabilityRepository } from '../repositories/coupon-applicability.repository';
import { CouponsRepository } from '../repositories/coupons.repository';

@Injectable()
export class CouponsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly couponsRepository: CouponsRepository,
    private readonly couponApplicabilityRepository: CouponApplicabilityRepository,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(BrandEntity)
    private readonly brandRepo: Repository<BrandEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
  ) {}

  async create(dto: CreateCouponDto, createdBy: string): Promise<ICoupon> {
    const code = this.normalizeCode(dto.code);
    const applicabilityScope = dto.applicabilityScope ?? CouponApplicabilityScope.ALL;

    this.validateCouponPayload({
      discountType: dto.discountType,
      discountAmount: dto.discountAmount,
      maxDiscount: dto.maxDiscount ?? null,
      startDate: dto.startDate,
      expiryDate: dto.expiryDate,
    });
    this.validateApplicabilityRefIds(applicabilityScope, dto);

    if (await this.couponsRepository.existsByCode(code)) {
      throw new ConflictException(`Coupon code "${code}" already exists`);
    }

    return this.dataSource.transaction(async (manager) => {
      const entity = await this.couponsRepository.create({
        couponType: dto.couponType.trim(),
        title: dto.title.trim(),
        code,
        sameUserLimit: dto.sameUserLimit ?? null,
        discountType: dto.discountType,
        discountAmount: dto.discountAmount.toFixed(2),
        minPurchase: (dto.minPurchase ?? 0).toFixed(2),
        maxDiscount:
          dto.maxDiscount !== undefined && dto.maxDiscount !== null
            ? dto.maxDiscount.toFixed(2)
            : null,
        startDate: dto.startDate,
        expiryDate: dto.expiryDate,
        applicabilityScope,
        status: dto.status ?? MasterStatus.ACTIVE,
        refId: await generateUniqueRefId(dto.title, (refId) =>
          this.couponsRepository.existsByRefId(refId),
        ),
        createdBy,
      });

      await this.syncApplicabilityMappings(entity.id, applicabilityScope, dto, manager);

      const refreshed = await this.couponsRepository.findById(entity.id);
      if (!refreshed) {
        throw new NotFoundException('Coupon not found after create');
      }
      return mapCouponEntityToResponse(refreshed);
    });
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<ICoupon>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.couponsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapCouponEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(refId: string): Promise<ICoupon> {
    const entity = await this.couponsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Coupon with refId ${refId} not found`);
    }
    return mapCouponEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateCouponDto, updatedBy: string): Promise<ICoupon> {
    const existing = await this.couponsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Coupon with refId ${refId} not found`);
    }

    const discountType = dto.discountType ?? existing.discountType;
    const discountAmount =
      dto.discountAmount ?? parseFloat(existing.discountAmount);
    const maxDiscount =
      dto.maxDiscount !== undefined
        ? dto.maxDiscount
        : toNullableMoney(existing.maxDiscount);
    const startDate = dto.startDate ?? existing.startDate;
    const expiryDate = dto.expiryDate ?? existing.expiryDate;
    const applicabilityScope = dto.applicabilityScope ?? existing.applicabilityScope;

    this.validateCouponPayload({
      discountType,
      discountAmount,
      maxDiscount,
      startDate,
      expiryDate,
    });

    let code: string | undefined;
    if (dto.code !== undefined) {
      code = this.normalizeCode(dto.code);
      if (await this.couponsRepository.existsByCode(code, refId)) {
        throw new ConflictException(`Coupon code "${code}" already exists`);
      }
    }

    const applicabilityTouched =
      dto.applicabilityScope !== undefined ||
      dto.categoryRefIds !== undefined ||
      dto.productRefIds !== undefined ||
      dto.brandRefIds !== undefined;

    if (applicabilityTouched) {
      this.validateApplicabilityRefIds(applicabilityScope, dto, existing);
    }

    return this.dataSource.transaction(async (manager) => {
      const updated = await this.couponsRepository.updateByRefId(refId, {
        couponType: dto.couponType?.trim(),
        title: dto.title?.trim(),
        code,
        sameUserLimit: dto.sameUserLimit !== undefined ? dto.sameUserLimit : undefined,
        discountType: dto.discountType,
        discountAmount:
          dto.discountAmount !== undefined ? dto.discountAmount.toFixed(2) : undefined,
        minPurchase: dto.minPurchase !== undefined ? dto.minPurchase.toFixed(2) : undefined,
        maxDiscount:
          dto.maxDiscount !== undefined
            ? dto.maxDiscount === null
              ? null
              : dto.maxDiscount.toFixed(2)
            : undefined,
        startDate: dto.startDate,
        expiryDate: dto.expiryDate,
        applicabilityScope: dto.applicabilityScope,
        status: dto.status,
        updatedBy,
      });

      if (!updated) {
        throw new NotFoundException(`Coupon with refId ${refId} not found after update`);
      }

      if (applicabilityTouched) {
        await this.syncApplicabilityMappings(updated.id, applicabilityScope, dto, manager, existing);
      }

      const refreshed = await this.couponsRepository.findById(updated.id);
      if (!refreshed) {
        throw new NotFoundException(`Coupon with refId ${refId} not found after update`);
      }
      return mapCouponEntityToResponse(refreshed);
    });
  }

  async updateStatus(
    refId: string,
    dto: UpdateCouponStatusDto,
    updatedBy: string,
  ): Promise<ICoupon> {
    const existing = await this.couponsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Coupon with refId ${refId} not found`);
    }

    const updated = await this.couponsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Coupon with refId ${refId} not found after status update`);
    }

    return mapCouponEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.couponsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Coupon with refId ${refId} not found`);
    }
    await this.couponsRepository.softDeleteByRefId(refId);
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private validateCouponPayload(payload: {
    discountType: CouponDiscountType;
    discountAmount: number;
    maxDiscount: number | null;
    startDate: Date;
    expiryDate: Date;
  }): void {
    if (payload.startDate >= payload.expiryDate) {
      throw new BadRequestException('expiryDate must be after startDate');
    }

    if (
      payload.discountType === CouponDiscountType.PERCENTAGE &&
      payload.discountAmount > 100
    ) {
      throw new BadRequestException('discountAmount cannot exceed 100 for percentage discounts');
    }

    if (payload.maxDiscount !== null && payload.maxDiscount <= 0) {
      throw new BadRequestException('maxDiscount must be greater than 0 when provided');
    }
  }

  private validateApplicabilityRefIds(
    scope: CouponApplicabilityScope,
    dto: CreateCouponDto | UpdateCouponDto,
    existing?: CouponEntity,
  ): void {
    const categoryRefIds = dto.categoryRefIds;
    const productRefIds = dto.productRefIds;
    const brandRefIds = dto.brandRefIds;

    const hasExtraRefIds =
      (scope !== CouponApplicabilityScope.CATEGORIES &&
        categoryRefIds !== undefined &&
        categoryRefIds.length > 0) ||
      (scope !== CouponApplicabilityScope.PRODUCTS &&
        productRefIds !== undefined &&
        productRefIds.length > 0) ||
      (scope !== CouponApplicabilityScope.BRANDS &&
        brandRefIds !== undefined &&
        brandRefIds.length > 0);

    if (scope === CouponApplicabilityScope.ALL && hasExtraRefIds) {
      throw new BadRequestException(
        'categoryRefIds, productRefIds, and brandRefIds must be empty when applicabilityScope is all',
      );
    }

    if (scope !== CouponApplicabilityScope.ALL && hasExtraRefIds) {
      throw new BadRequestException(
        'Only the refIds matching applicabilityScope are allowed (e.g. categoryRefIds for categories scope)',
      );
    }
  }

  private async syncApplicabilityMappings(
    couponId: string,
    scope: CouponApplicabilityScope,
    dto: CreateCouponDto | UpdateCouponDto,
    manager?: EntityManager,
    existing?: CouponEntity,
  ): Promise<void> {
    switch (scope) {
      case CouponApplicabilityScope.ALL:
        await Promise.all([
          this.couponApplicabilityRepository.syncCategories(couponId, [], manager),
          this.couponApplicabilityRepository.syncProducts(couponId, [], manager),
          this.couponApplicabilityRepository.syncBrands(couponId, [], manager),
        ]);
        return;
      case CouponApplicabilityScope.CATEGORIES: {
        const categoryIds =
          dto.categoryRefIds !== undefined
            ? await this.resolveCategoryIds(dto.categoryRefIds)
            : (existing?.categoryMappings ?? []).map((mapping) => mapping.categoryId);
        await Promise.all([
          this.couponApplicabilityRepository.syncCategories(couponId, categoryIds, manager),
          this.couponApplicabilityRepository.syncProducts(couponId, [], manager),
          this.couponApplicabilityRepository.syncBrands(couponId, [], manager),
        ]);
        return;
      }
      case CouponApplicabilityScope.PRODUCTS: {
        const productIds =
          dto.productRefIds !== undefined
            ? await this.resolveProductIds(dto.productRefIds)
            : (existing?.productMappings ?? []).map((mapping) => mapping.productId);
        await Promise.all([
          this.couponApplicabilityRepository.syncCategories(couponId, [], manager),
          this.couponApplicabilityRepository.syncProducts(couponId, productIds, manager),
          this.couponApplicabilityRepository.syncBrands(couponId, [], manager),
        ]);
        return;
      }
      case CouponApplicabilityScope.BRANDS: {
        const brandIds =
          dto.brandRefIds !== undefined
            ? await this.resolveBrandIds(dto.brandRefIds)
            : (existing?.brandMappings ?? []).map((mapping) => mapping.brandId);
        await Promise.all([
          this.couponApplicabilityRepository.syncCategories(couponId, [], manager),
          this.couponApplicabilityRepository.syncProducts(couponId, [], manager),
          this.couponApplicabilityRepository.syncBrands(couponId, brandIds, manager),
        ]);
      }
    }
  }

  private async resolveCategoryIds(refIds: string[]): Promise<string[]> {
    return this.resolveRefIds(
      refIds,
      (uniqueRefIds) =>
        this.categoryRepo.find({
          where: { refId: In(uniqueRefIds) },
          select: { id: true, refId: true },
        }),
      'Category',
    );
  }

  private async resolveBrandIds(refIds: string[]): Promise<string[]> {
    return this.resolveRefIds(
      refIds,
      (uniqueRefIds) =>
        this.brandRepo.find({
          where: { refId: In(uniqueRefIds) },
          select: { id: true, refId: true },
        }),
      'Brand',
    );
  }

  private async resolveProductIds(refIds: string[]): Promise<string[]> {
    return this.resolveRefIds(
      refIds,
      (uniqueRefIds) =>
        this.productRepo.find({
          where: { refId: In(uniqueRefIds) },
          select: { id: true, refId: true },
        }),
      'Product',
    );
  }

  private async resolveRefIds(
    refIds: string[],
    loader: (uniqueRefIds: string[]) => Promise<Array<{ id: string; refId: string }>>,
    entityName: string,
  ): Promise<string[]> {
    const uniqueRefIds = [...new Set(refIds.map((refId) => refId.trim()).filter(Boolean))];
    if (!uniqueRefIds.length) return [];

    const rows = await loader(uniqueRefIds);
    if (rows.length !== uniqueRefIds.length) {
      const found = new Set(rows.map((row) => row.refId));
      const missing = uniqueRefIds.filter((refId) => !found.has(refId));
      throw new NotFoundException(`${entityName}(s) not found: ${missing.join(', ')}`);
    }

    const byRefId = new Map(rows.map((row) => [row.refId, row.id]));
    return uniqueRefIds.map((refId) => byRefId.get(refId)!);
  }
}

const toNullableMoney = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined) return null;
  return parseFloat(value);
};
