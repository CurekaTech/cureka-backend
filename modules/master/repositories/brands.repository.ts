import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../entities/brand.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { PaginationOptions } from '@packages/common';
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

  async findByRefId(refId: string): Promise<BrandEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<BrandEntity | null> {
    return this.repo.findOne({ where: { slug } });
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
    options: PaginationOptions,
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
      qb.where('(brand.name ILIKE :search OR brand.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findAllByStatus(status?: MasterStatus): Promise<BrandEntity[]> {
    const qb = this.repo.createQueryBuilder('brand').orderBy('brand.name', 'ASC');
    if (status) {
      qb.where('brand.status = :status', { status });
    }
    return qb.getMany();
  }

  async existsBySlug(slug: string): Promise<boolean> {
    const count = await this.repo.count({ where: { slug } });
    return count > 0;
  }

  /** Counts brands flagged for the homepage (optionally excluding one brand). */
  async countInHomePage(excludeId?: string): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('brand')
      .where('brand.inHomePage = :enabled', { enabled: true });

    if (excludeId) {
      qb.andWhere('brand.id != :excludeId', { excludeId });
    }

    return qb.getCount();
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
      .getCount();
    return count > 0;
  }
}
