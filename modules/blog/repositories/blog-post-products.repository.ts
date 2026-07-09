import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { generateUniqueRefId } from '@packages/common';
import { BlogPostProductEntity } from '../entities/blog-post-product.entity';

@Injectable()
export class BlogPostProductsRepository {
  constructor(
    @InjectRepository(BlogPostProductEntity)
    private readonly repo: Repository<BlogPostProductEntity>,
  ) {}

  private async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async findByBlogPostId(blogPostId: string): Promise<BlogPostProductEntity[]> {
    return this.repo.find({
      where: { blogPostId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async findProductRefIdsByBlogPostId(blogPostId: string): Promise<string[]> {
    const rows = await this.findByBlogPostId(blogPostId);
    return rows.map((row) => row.productRefId);
  }

  async replaceForBlogPost(
    blogPostId: string,
    productRefIds: string[],
    actor: string,
  ): Promise<void> {
    await this.repo.delete({ blogPostId });

    if (!productRefIds.length) return;

    const uniqueRefIds = [...new Set(productRefIds)];
    const entities: BlogPostProductEntity[] = [];

    for (const [index, productRefId] of uniqueRefIds.entries()) {
      const refId = await generateUniqueRefId(productRefId, (id) => this.existsByRefId(id));
      entities.push(
        this.repo.create({
          refId,
          blogPostId,
          productRefId,
          sortOrder: index,
          createdBy: actor,
          updatedBy: actor,
        }),
      );
    }

    await this.repo.save(entities);  }

  async findByBlogPostIds(blogPostIds: string[]): Promise<BlogPostProductEntity[]> {
    if (!blogPostIds.length) return [];
    return this.repo.find({
      where: { blogPostId: In(blogPostIds) },
      order: { sortOrder: 'ASC' },
    });
  }
}
