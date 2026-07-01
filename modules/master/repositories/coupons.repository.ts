import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { CouponEntity } from '../entities/coupon.entity';

@Injectable()
export class CouponsRepository {
  constructor(
    @InjectRepository(CouponEntity)
    private readonly repo: Repository<CouponEntity>,
  ) {}

  async create(data: Partial<CouponEntity>): Promise<CouponEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<CouponEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: this.applicabilityRelations,
    });
  }

  async findById(id: string): Promise<CouponEntity | null> {
    return this.repo.findOne({
      where: { id },
      relations: this.applicabilityRelations,
    });
  }

  async findByCode(code: string): Promise<CouponEntity | null> {
    return this.repo
      .createQueryBuilder('coupon')
      .leftJoinAndSelect('coupon.categoryMappings', 'categoryMappings')
      .leftJoinAndSelect('categoryMappings.category', 'category')
      .leftJoinAndSelect('coupon.productMappings', 'productMappings')
      .leftJoinAndSelect('productMappings.product', 'product')
      .leftJoinAndSelect('coupon.brandMappings', 'brandMappings')
      .leftJoinAndSelect('brandMappings.brand', 'brand')
      .where('UPPER(coupon.code) = UPPER(:code)', { code: code.trim() })
      .andWhere('coupon.deletedAt IS NULL')
      .getOne();
  }

  private readonly applicabilityRelations = {
    categoryMappings: { category: true },
    productMappings: { product: true },
    brandMappings: { brand: true },
  };

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByCode(code: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('coupon')
      .where('UPPER(coupon.code) = UPPER(:code)', { code });

    if (excludeRefId) {
      qb.andWhere('coupon.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<CouponEntity>,
  ): Promise<CouponEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: CouponEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'coupon.createdAt',
      title: 'coupon.title',
      code: 'coupon.code',
      couponType: 'coupon.couponType',
      startDate: 'coupon.startDate',
      expiryDate: 'coupon.expiryDate',
      status: 'coupon.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'coupon.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('coupon')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(coupon.title ILIKE :search OR coupon.code ILIKE :search OR coupon.couponType ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findAllActiveValid(now = new Date()): Promise<CouponEntity[]> {
    return this.repo
      .createQueryBuilder('coupon')
      .leftJoinAndSelect('coupon.categoryMappings', 'categoryMappings')
      .leftJoinAndSelect('categoryMappings.category', 'category')
      .leftJoinAndSelect('coupon.productMappings', 'productMappings')
      .leftJoinAndSelect('productMappings.product', 'product')
      .leftJoinAndSelect('coupon.brandMappings', 'brandMappings')
      .leftJoinAndSelect('brandMappings.brand', 'brand')
      .where('coupon.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('coupon.startDate <= :now', { now })
      .andWhere('coupon.expiryDate >= :now', { now })
      .orderBy('coupon.expiryDate', 'ASC')
      .addOrderBy('coupon.title', 'ASC')
      .getMany();
  }
}
