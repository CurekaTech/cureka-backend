import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogAuditLogEntity } from '../entities/blog-audit-log.entity';
import { BlogAuditAction } from '../enums/blog-audit-action.enum';

@Injectable()
export class BlogAuditLogsRepository {
  constructor(
    @InjectRepository(BlogAuditLogEntity)
    private readonly repo: Repository<BlogAuditLogEntity>,
  ) {}

  async create(data: {
    blogPostId: string;
    action: BlogAuditAction;
    performedBy: string;
    details?: Record<string, unknown> | null;
  }): Promise<BlogAuditLogEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByBlogPostId(blogPostId: string): Promise<BlogAuditLogEntity[]> {
    return this.repo.find({
      where: { blogPostId },
      order: { createdAt: 'DESC' },
    });
  }
}
