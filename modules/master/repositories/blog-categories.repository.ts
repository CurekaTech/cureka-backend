import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { BlogCategoryEntity } from '../entities/blog-category.entity';
import { BlogCategoryStatus } from '../enums/blog-category-status.enum';

export interface BlogCategoryFindOptions extends PaginationOptions {
  status?: BlogCategoryStatus;
}

@Injectable()
export class BlogCategoriesRepository {
  constructor(
    @InjectRepository(BlogCategoryEntity)
    private readonly repo: Repository<BlogCategoryEntity>,
  ) {}

  async create(data: Partial<BlogCategoryEntity>): Promise<BlogCategoryEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<BlogCategoryEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<BlogCategoryEntity | null> {
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
    data: Partial<BlogCategoryEntity>,
  ): Promise<BlogCategoryEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllActive(): Promise<BlogCategoryEntity[]> {
    return this.repo.find({
      where: { status: BlogCategoryStatus.ACTIVE },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async findAllPaginated(
    options: BlogCategoryFindOptions,
  ): Promise<{ data: BlogCategoryEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('category')
      .orderBy('category.sortOrder', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('category.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(category.name ILIKE :search OR category.slug ILIKE :search OR category.description ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
