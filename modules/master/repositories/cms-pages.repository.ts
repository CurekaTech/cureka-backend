import { applyMasterListOrdering } from '../utils/master-list-query.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { CmsPageEntity } from '../entities/cms-page.entity';

export interface CmsPageFindOptions extends PaginationOptions {
  status?: MasterStatus;
}

export const PREDEFINED_CMS_PAGES = [
  { title: 'About Cureka', slug: 'about-cureka', predefinedKey: 'aboutCureka' },
  { title: 'Privacy Policy', slug: 'privacy-policy', predefinedKey: 'privacyPolicy' },
  { title: 'Terms & Conditions', slug: 'terms-and-conditions', predefinedKey: 'termsAndConditions' },
  { title: 'Returns & Refunds', slug: 'returns-refunds', predefinedKey: 'returnsRefunds' },
  { title: 'Shipping Policy', slug: 'shipping-policy', predefinedKey: 'shippingPolicy' },
] as const;

@Injectable()
export class CmsPagesRepository {
  constructor(
    @InjectRepository(CmsPageEntity)
    private readonly repo: Repository<CmsPageEntity>,
  ) {}

  async create(data: Partial<CmsPageEntity>): Promise<CmsPageEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<CmsPageEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<CmsPageEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('page')
      .where('page.slug = :slug', { slug })
      .andWhere('page.deletedAt IS NULL');
    if (excludeRefId) {
      qb.andWhere('page.refId != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<CmsPageEntity>,
  ): Promise<CmsPageEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: CmsPageFindOptions,
  ): Promise<{ data: CmsPageEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'page.createdAt',
      updatedAt: 'page.updatedAt',
      title: 'page.title',
      slug: 'page.slug',
      status: 'page.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'page.title';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('page')
      
      .addOrderBy('page.createdAt', 'ASC')
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'page', options.status, sortColumn, sortOrder);

    if (options.status) {
      qb.andWhere('page.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(page.title ILIKE :search OR page.slug ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveBySlug(slug: string): Promise<CmsPageEntity | null> {
    return this.repo.findOne({
      where: { slug, status: MasterStatus.ACTIVE },
    });
  }

  async findActiveBySlugs(slugs: string[]): Promise<CmsPageEntity[]> {
    if (!slugs.length) return [];
    return this.repo
      .createQueryBuilder('page')
      .where('page.slug IN (:...slugs)', { slugs })
      .andWhere('page.status = :status', { status: MasterStatus.ACTIVE })
      .getMany();
  }

  async findActiveByPredefinedKeys(predefinedKeys: string[]): Promise<CmsPageEntity[]> {
    if (!predefinedKeys.length) return [];
    return this.repo
      .createQueryBuilder('page')
      .where('page.predefinedKey IN (:...predefinedKeys)', { predefinedKeys })
      .andWhere('page.status = :status', { status: MasterStatus.ACTIVE })
      .getMany();
  }
}
