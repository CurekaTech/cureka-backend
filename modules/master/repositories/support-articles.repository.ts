import { applyMasterListOrdering } from '../utils/master-list-query.util';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { SupportArticleEntity } from '../entities/support-article.entity';
import { SupportContentStatus } from '../enums/support-content-status.enum';

export interface SupportArticleFindOptions extends PaginationOptions {
  categoryRefId?: string;
  status?: SupportContentStatus;
}

@Injectable()
export class SupportArticlesRepository {
  constructor(
    @InjectRepository(SupportArticleEntity)
    private readonly repo: Repository<SupportArticleEntity>,
  ) {}

  async create(data: Partial<SupportArticleEntity>): Promise<SupportArticleEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<SupportArticleEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<SupportArticleEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('a')
      .where('a.slug = :slug', { slug })
      .andWhere('a.deletedAt IS NULL');
    if (excludeRefId) {
      qb.andWhere('a.ref_id != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<SupportArticleEntity>,
  ): Promise<SupportArticleEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async incrementViews(refId: string): Promise<void> {
    await this.repo.increment({ refId }, 'views', 1);
  }

  async findAllPaginated(
    options: SupportArticleFindOptions,
  ): Promise<{ data: SupportArticleEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('article')
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'article', options.status, 'article.createdAt', 'DESC');

    if (options.categoryRefId) {
      qb.andWhere('article.category_ref_id = :categoryRefId', {
        categoryRefId: options.categoryRefId,
      });
    }

    if (options.status) {
      qb.andWhere('article.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(article.title ILIKE :search OR article.content ILIKE :search OR article.slug ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
