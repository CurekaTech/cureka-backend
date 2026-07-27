import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { BlogCommentEntity } from '../entities/blog-comment.entity';
import { BlogCommentStatus } from '../enums/blog-comment-status.enum';

export interface BlogCommentFindOptions extends PaginationOptions {
  blogPostRefId?: string;
  status?: BlogCommentStatus;
}

@Injectable()
export class BlogCommentsRepository {
  constructor(
    @InjectRepository(BlogCommentEntity)
    private readonly repo: Repository<BlogCommentEntity>,
  ) {}

  async create(data: Partial<BlogCommentEntity>): Promise<BlogCommentEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<BlogCommentEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<BlogCommentEntity>,
  ): Promise<BlogCommentEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findApprovedByBlogPostRefId(blogPostRefId: string): Promise<BlogCommentEntity[]> {
    return this.repo.find({
      where: { blogPostRefId, status: BlogCommentStatus.APPROVED },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    options: BlogCommentFindOptions,
  ): Promise<{ data: BlogCommentEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('comment')
      .orderBy('comment.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.blogPostRefId) {
      qb.andWhere('comment.blog_post_ref_id = :blogPostRefId', {
        blogPostRefId: options.blogPostRefId,
      });
    }

    if (options.status) {
      qb.andWhere('comment.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(comment.content ILIKE :search OR comment.guest_name ILIKE :search OR comment.guest_email ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb
      .leftJoinAndSelect('comment.blogPost', 'post')
      .getManyAndCount();
    return { data, total };
  }
}
