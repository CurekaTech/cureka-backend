import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { ProductReviewEntity } from '../entities/product-review.entity';
import { ProductReviewStatus } from '../enums/product-review-status.enum';

export interface ProductReviewFindOptions extends PaginationOptions {
  status?: ProductReviewStatus;
  productRefId?: string;
}

@Injectable()
export class ProductReviewsRepository {
  constructor(
    @InjectRepository(ProductReviewEntity)
    private readonly repo: Repository<ProductReviewEntity>,
  ) {}

  async create(data: Partial<ProductReviewEntity>): Promise<ProductReviewEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ProductReviewEntity | null> {
    return this.repo.findOne({
      where: { refId },
      relations: { product: { media: true } },
    });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductReviewEntity>,
  ): Promise<ProductReviewEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findApprovedByProductId(productId: string): Promise<ProductReviewEntity[]> {
    return this.repo.find({
      where: { productId, status: ProductReviewStatus.APPROVED },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllPaginated(
    options: ProductReviewFindOptions,
  ): Promise<{ data: ProductReviewEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const qb = this.repo
      .createQueryBuilder('review')
      .leftJoinAndSelect('review.product', 'product')
      .leftJoinAndSelect('product.media', 'media')
      .orderBy('review.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('review.status = :status', { status: options.status });
    }

    if (options.productRefId) {
      qb.andWhere('review.product_ref_id = :productRefId', {
        productRefId: options.productRefId,
      });
    }

    if (options.search) {
      qb.andWhere(
        '(review.customer_name ILIKE :search OR review.review ILIKE :search OR product.name ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async summarizeApprovedByProductIds(
    productIds: string[],
  ): Promise<Map<string, { averageRating: number; reviewCount: number }>> {
    const ids = [...new Set(productIds.filter(Boolean))];
    const result = new Map<string, { averageRating: number; reviewCount: number }>();
    if (!ids.length) return result;

    const rows = (await this.repo.query(
      `
      SELECT product_id, COUNT(*)::int AS review_count, AVG(rating)::float AS average_rating
      FROM product_reviews
      WHERE status = $1
        AND deleted_at IS NULL
        AND product_id = ANY($2::uuid[])
      GROUP BY product_id
      `,
      [ProductReviewStatus.APPROVED, ids],
    )) as Array<{ product_id: string; review_count: number; average_rating: number | null }>;

    for (const row of rows) {
      const count = Number(row.review_count) || 0;
      const average = row.average_rating == null ? 0 : Math.round(Number(row.average_rating) * 10) / 10;
      result.set(row.product_id, { averageRating: count ? average : 0, reviewCount: count });
    }
    return result;
  }
}
