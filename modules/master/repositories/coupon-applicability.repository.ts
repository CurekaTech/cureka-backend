import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { CouponBrandMappingEntity } from '../entities/coupon-brand-mapping.entity';
import { CouponCategoryMappingEntity } from '../entities/coupon-category-mapping.entity';
import { CouponProductMappingEntity } from '../entities/coupon-product-mapping.entity';

@Injectable()
export class CouponApplicabilityRepository {
  constructor(
    @InjectRepository(CouponCategoryMappingEntity)
    private readonly categoryMappingsRepo: Repository<CouponCategoryMappingEntity>,
    @InjectRepository(CouponProductMappingEntity)
    private readonly productMappingsRepo: Repository<CouponProductMappingEntity>,
    @InjectRepository(CouponBrandMappingEntity)
    private readonly brandMappingsRepo: Repository<CouponBrandMappingEntity>,
  ) {}

  async syncCategories(
    couponId: string,
    categoryIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getCategoryRepo(manager);
    await repo.delete({ couponId });
    if (!categoryIds.length) return;
    await repo.save(
      categoryIds.map((categoryId) => repo.create({ couponId, categoryId })),
    );
  }

  async syncProducts(
    couponId: string,
    productIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getProductRepo(manager);
    await repo.delete({ couponId });
    if (!productIds.length) return;
    await repo.save(
      productIds.map((productId) => repo.create({ couponId, productId })),
    );
  }

  async syncBrands(
    couponId: string,
    brandIds: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getBrandRepo(manager);
    await repo.delete({ couponId });
    if (!brandIds.length) return;
    await repo.save(brandIds.map((brandId) => repo.create({ couponId, brandId })));
  }

  async findCategoryMappingsByCouponId(couponId: string, manager?: EntityManager) {
    const repo = this.getCategoryRepo(manager);
    return repo.find({
      where: { couponId },
      relations: { category: true },
    });
  }

  async findProductMappingsByCouponId(couponId: string, manager?: EntityManager) {
    const repo = this.getProductRepo(manager);
    return repo.find({
      where: { couponId },
      relations: { product: true },
    });
  }

  async findBrandMappingsByCouponId(couponId: string, manager?: EntityManager) {
    const repo = this.getBrandRepo(manager);
    return repo.find({
      where: { couponId },
      relations: { brand: true },
    });
  }

  async findCategoryIdsByCouponIds(couponIds: string[]): Promise<Map<string, string[]>> {
    if (!couponIds.length) return new Map();
    const rows = await this.categoryMappingsRepo.find({
      where: { couponId: In(couponIds) },
      select: { couponId: true, categoryId: true },
    });
    return this.groupIds(
      rows.map((row) => ({ couponId: row.couponId, categoryId: row.categoryId })),
      'couponId',
      'categoryId',
    );
  }

  private groupIds<T extends Record<string, string>>(
    rows: T[],
    groupKey: keyof T,
    valueKey: keyof T,
  ): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = row[groupKey];
      const existing = map.get(key) ?? [];
      existing.push(row[valueKey]);
      map.set(key, existing);
    }
    return map;
  }

  private getCategoryRepo(manager?: EntityManager) {
    return manager
      ? manager.getRepository(CouponCategoryMappingEntity)
      : this.categoryMappingsRepo;
  }

  private getProductRepo(manager?: EntityManager) {
    return manager
      ? manager.getRepository(CouponProductMappingEntity)
      : this.productMappingsRepo;
  }

  private getBrandRepo(manager?: EntityManager) {
    return manager ? manager.getRepository(CouponBrandMappingEntity) : this.brandMappingsRepo;
  }
}
