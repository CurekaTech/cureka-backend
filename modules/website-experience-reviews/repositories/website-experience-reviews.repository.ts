import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { WebsiteExperienceReviewEntity } from '../entities/website-experience-review.entity';

@Injectable()
export class WebsiteExperienceReviewsRepository {
  constructor(
    @InjectRepository(WebsiteExperienceReviewEntity)
    private readonly repo: Repository<WebsiteExperienceReviewEntity>,
  ) {}

  create(data: Partial<WebsiteExperienceReviewEntity>): Promise<WebsiteExperienceReviewEntity> {
    return this.repo.save(this.repo.create(data));
  }

  findByOrderId(orderId: string): Promise<WebsiteExperienceReviewEntity | null> {
    return this.repo.findOne({ where: { orderId } });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: WebsiteExperienceReviewEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('review')
      .orderBy('review.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        `(
          review.customer_name ILIKE :search
          OR review.customer_email ILIKE :search
          OR review.order_number ILIKE :search
          OR review.feedback ILIKE :search
        )`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
