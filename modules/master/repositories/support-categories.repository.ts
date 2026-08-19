import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { SupportCategoryEntity } from '../entities/support-category.entity';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';

export interface SupportCategoryFindOptions extends PaginationOptions {
  type?: SupportCategoryType;
  status?: SupportContentStatus;
}

@Injectable()
export class SupportCategoriesRepository {
  constructor(
    @InjectRepository(SupportCategoryEntity)
    private readonly repo: Repository<SupportCategoryEntity>,
  ) {}

  async create(data: Partial<SupportCategoryEntity>): Promise<SupportCategoryEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<SupportCategoryEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<SupportCategoryEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.slug = :slug', { slug })
      .andWhere('c.deletedAt IS NULL');
    if (excludeRefId) {
      qb.andWhere('c.ref_id != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<SupportCategoryEntity>,
  ): Promise<SupportCategoryEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: SupportCategoryFindOptions,
  ): Promise<{ data: SupportCategoryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('category')
      .orderBy('category.name', 'ASC')
      .skip(skip)
      .take(take);

    if (options.type) {
      qb.andWhere('(category.type = :type OR category.type = :both)', {
        type: options.type,
        both: SupportCategoryType.BOTH,
      });
    }

    if (options.status) {
      qb.andWhere('category.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere('(category.name ILIKE :search OR category.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findAllActive(type?: SupportCategoryType): Promise<SupportCategoryEntity[]> {
    const qb = this.repo
      .createQueryBuilder('category')
      .where('category.status = :status', { status: SupportContentStatus.ACTIVE })
      .orderBy('category.name', 'ASC');

    if (type) {
      qb.andWhere('(category.type = :type OR category.type = :both)', {
        type,
        both: SupportCategoryType.BOTH,
      });
    }

    return qb.getMany();
  }
}
