import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { BlogPostEntity } from '../entities/blog-post.entity';
import { BlogPostStatus } from '../enums/blog-post-status.enum';
import { BlogPostVisibility } from '../enums/blog-post-visibility.enum';

export interface BlogPostFindOptions extends PaginationOptions {
  categoryRefId?: string;
  status?: BlogPostStatus;
  visibility?: BlogPostVisibility;
  isFeatured?: boolean;
  isTrending?: boolean;
  tag?: string;
}

@Injectable()
export class BlogPostsRepository {
  constructor(
    @InjectRepository(BlogPostEntity)
    private readonly repo: Repository<BlogPostEntity>,
  ) {}

  async create(data: Partial<BlogPostEntity>): Promise<BlogPostEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<BlogPostEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<BlogPostEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsBySlug(slug: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo.createQueryBuilder('p').where('p.slug = :slug', { slug });
    if (excludeRefId) {
      qb.andWhere('p.ref_id != :excludeRefId', { excludeRefId });
    }
    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<BlogPostEntity>,
  ): Promise<BlogPostEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async incrementViews(refId: string): Promise<void> {
    await this.repo.increment({ refId }, 'views', 1);
  }

  async findRelated(
    categoryRefId: string,
    excludeRefId: string,
    limit = 6,
  ): Promise<BlogPostEntity[]> {
    return this.repo.find({
      where: {
        categoryRefId,
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
      },
      order: { publishedAt: 'DESC' },
      take: limit + 1,
    }).then((posts) =>
      posts.filter((post) => post.refId !== excludeRefId).slice(0, limit),
    );
  }

  async findFeatured(limit = 6): Promise<BlogPostEntity[]> {
    return this.repo.find({
      where: {
        isFeatured: true,
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
      },
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async findTrending(limit = 6): Promise<BlogPostEntity[]> {
    return this.repo.find({
      where: {
        isTrending: true,
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
      },
      order: { views: 'DESC', publishedAt: 'DESC' },
      take: limit,
    });
  }

  async findScheduledReady(now: Date): Promise<BlogPostEntity[]> {
    return this.repo
      .createQueryBuilder('post')
      .where('post.status = :status', { status: BlogPostStatus.SCHEDULED })
      .andWhere('post.scheduled_at IS NOT NULL')
      .andWhere('post.scheduled_at <= :now', { now })
      .getMany();
  }

  async findAllPaginated(
    options: BlogPostFindOptions,
  ): Promise<{ data: BlogPostEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('post')
      .orderBy('post.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.categoryRefId) {
      qb.andWhere('post.category_ref_id = :categoryRefId', {
        categoryRefId: options.categoryRefId,
      });
    }

    if (options.status) {
      qb.andWhere('post.status = :status', { status: options.status });
    }

    if (options.visibility) {
      qb.andWhere('post.visibility = :visibility', { visibility: options.visibility });
    }

    if (options.isFeatured !== undefined) {
      qb.andWhere('post.is_featured = :isFeatured', { isFeatured: options.isFeatured });
    }

    if (options.isTrending !== undefined) {
      qb.andWhere('post.is_trending = :isTrending', { isTrending: options.isTrending });
    }

    if (options.tag) {
      qb.andWhere('post.tags ILIKE :tagPattern', { tagPattern: `%${options.tag}%` });
    }

    if (options.search) {
      qb.andWhere(
        '(post.title ILIKE :search OR post.excerpt ILIKE :search OR post.content ILIKE :search OR post.slug ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findLatestPublished(limit = 6): Promise<BlogPostEntity[]> {
    return this.repo.find({
      where: {
        status: BlogPostStatus.PUBLISHED,
        visibility: BlogPostVisibility.PUBLIC,
      },
      order: { publishedAt: 'DESC', createdAt: 'DESC' },
      take: limit,
    });
  }
}
