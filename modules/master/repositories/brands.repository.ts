import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { BrandEntity } from '../entities/brand.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { CursorPaginatedResult, PaginationOptions } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { MasterListOptions } from '../utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class BrandsRepository {
  constructor(
    @InjectRepository(BrandEntity)
    private readonly repo: Repository<BrandEntity>,
  ) {}

  async create(data: Partial<BrandEntity>): Promise<BrandEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<BrandEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findBySlug(slug: string): Promise<BrandEntity | null> {
    return this.repo
      .createQueryBuilder('brand')
      .where('brand.slug = :slug', { slug })
      .andWhere('brand.deletedAt IS NULL')
      .getOne();
  }

  /** Storefront/public lookup — inactive brands must not resolve. */
  async findActiveBySlug(slug: string): Promise<BrandEntity | null> {
    return this.repo
      .createQueryBuilder('brand')
      .where('brand.slug = :slug', { slug })
      .andWhere('brand.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('brand.deletedAt IS NULL')
      .getOne();
  }

  async findBySlugs(slugs: string[]): Promise<BrandEntity[]> {
    if (!slugs.length) return [];

    return this.repo
      .createQueryBuilder('brand')
      .where('brand.slug IN (:...slugs)', { slugs })
      .andWhere('brand.deletedAt IS NULL')
      .getMany();
  }

  /** Storefront/public multi-slug lookup — only ACTIVE brands. */
  async findActiveBySlugs(slugs: string[]): Promise<BrandEntity[]> {
    if (!slugs.length) return [];

    return this.repo
      .createQueryBuilder('brand')
      .where('brand.slug IN (:...slugs)', { slugs })
      .andWhere('brand.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('brand.deletedAt IS NULL')
      .getMany();
  }

  async findByRefId(refId: string): Promise<BrandEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findByRefIds(refIds: string[]): Promise<BrandEntity[]> {
    if (!refIds.length) return [];
    return this.repo.find({ where: { refId: In(refIds) } });
  }

  /** Storefront/public lookup — inactive brands must not resolve. */
  async findActiveByRefId(refId: string): Promise<BrandEntity | null> {
    return this.repo
      .createQueryBuilder('brand')
      .where('brand.refId = :refId', { refId })
      .andWhere('brand.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('brand.deletedAt IS NULL')
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(refId: string, data: Partial<BrandEntity>): Promise<BrandEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<BrandEntity>): Promise<BrandEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: BrandEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'brand.createdAt',
      name: 'brand.name',
      slug: 'brand.slug',
      status: 'brand.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'brand.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('brand')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('(brand.name ILIKE :search OR brand.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    if (options.status) {
      qb.andWhere('brand.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findPublicPaginated(
    options: PaginationOptions,
  ): Promise<{ data: BrandEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'brand.createdAt',
      name: 'brand.name',
      slug: 'brand.slug',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'brand.name';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('brand')
      .where('brand.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(brand.name ILIKE :search OR brand.slug ILIKE :search OR brand.refId ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<BrandEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'brand',
      sortableColumns: {
        createdAt: 'brand.createdAt',
        name: 'brand.name',
        slug: 'brand.slug',
        status: 'brand.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: '(brand.name ILIKE :search OR brand.slug ILIKE :search)',
    });
  }

  async findAllActive(): Promise<BrandEntity[]> {
    return this.repo.find({
      where: { status: MasterStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<BrandEntity[]> {    const qb = this.repo.createQueryBuilder('brand').orderBy('brand.name', 'ASC');
    if (status) {
      qb.where('brand.status = :status', { status });
    }
    return qb.getMany();
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('brand')
      .where('brand.slug = :slug', { slug })
      .andWhere('brand.deletedAt IS NULL')
      .getCount();
    return count > 0;
  }

  /** Active brands shown on the homepage (newest first), capped to `limit`. */
  async findHomePageBrands(limit: number): Promise<BrandEntity[]> {
    return this.repo
      .createQueryBuilder('brand')
      .where('brand.inHomePage = :enabled', { enabled: true })
      .andWhere('brand.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('brand.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  async existsBySlugExcluding(slug: string, excludeId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('brand')
      .where('brand.slug = :slug', { slug })
      .andWhere('brand.id != :excludeId', { excludeId })
      .andWhere('brand.deletedAt IS NULL')
      .getCount();
    return count > 0;
  }
}
