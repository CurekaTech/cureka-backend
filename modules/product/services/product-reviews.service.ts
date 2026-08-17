import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { OrdersService } from '@modules/orders/services/orders.service';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductMediaEntity } from '@modules/product/entities/product-media.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { UsersRepository } from '@modules/users/repositories/users.repository';
import {
  CreateProductReviewDto,
  ProductReviewQueryDto,
  UpdateProductReviewStatusDto,
} from '../dto/product-review.dto';
import { ProductReviewStatus } from '../enums/product-review-status.enum';
import {
  IProductReview,
  IPublicProductReviewsResponse,
  IPublicProductReviewSummary,
} from '../interfaces/product-review.interface';
import {
  mapProductReviewEntityToAdmin,
  mapProductReviewEntityToPublic,
} from '../mappers/product-review.mapper';
import { ProductReviewsRepository } from '../repositories/product-reviews.repository';
import { ProductReviewEntity } from '../entities/product-review.entity';

@Injectable()
export class ProductReviewsService {
  constructor(
    private readonly reviewsRepository: ProductReviewsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(query: ProductReviewQueryDto): Promise<PaginatedResult<IProductReview>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.reviewsRepository.findAllPaginated({
      ...pagination,
      status: query.status,
      productRefId: query.productRefId,
    });

    const mapped = await Promise.all(
      data.map(async (entity) => {
        const productImage = this.resolvePrimaryMedia(entity.product?.media);
        const item = mapProductReviewEntityToAdmin(entity, {
          productName: entity.product?.name ?? null,
          productImage,
        });
        return this.storageUrlEnricher.enrichFields(item, ['productImage']);
      }),
    );

    return buildPaginatedResult(mapped, total, pagination);
  }

  async findApprovedByProductSlug(slug: string): Promise<IPublicProductReviewsResponse> {
    const product = await this.resolvePublishedProduct(slug);
    const reviews = await this.reviewsRepository.findApprovedByProductId(product.id);

    return {
      summary: this.buildSummary(reviews),
      reviews: reviews.map(mapProductReviewEntityToPublic),
    };
  }

  async canReviewForProductSlug(
    slug: string,
    user?: IUserSessionContext,
  ): Promise<{ canReview: boolean }> {
    if (!user?.isRegistered || !user.sub) {
      return { canReview: false };
    }

    const product = await this.resolvePublishedProduct(slug);
    const hasOrdered = await this.ordersService.userHasOrderedProduct(user.sub, product.id);
    return { canReview: hasOrdered };
  }

  async createForProductSlug(
    slug: string,
    dto: CreateProductReviewDto,
    user?: IUserSessionContext,
  ) {
    if (!user?.isRegistered || !user.sub) {
      throw new ForbiddenException('Please sign in to submit a product review');
    }

    const product = await this.resolvePublishedProduct(slug);

    const hasOrdered = await this.ordersService.userHasOrderedProduct(user.sub, product.id);
    if (!hasOrdered) {
      throw new ForbiddenException('Only customers who ordered this product can submit a review');
    }

    const rating = Number(dto.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const reviewText = dto.review?.trim();
    if (!reviewText) {
      throw new BadRequestException('Review text is required');
    }

    const customer = await this.usersRepository.findById(user.sub);
    const customerName =
      [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim() ||
      customer?.email ||
      user.profile?.email ||
      'Customer';

    const refId = await generateUniqueRefId(reviewText.slice(0, 20), (id) =>
      this.reviewsRepository.existsByRefId(id),
    );

    const entity = await this.reviewsRepository.create({
      refId,
      productId: product.id,
      productRefId: product.refId,
      userId: user.sub,
      customerName,
      rating,
      review: reviewText,
      status: ProductReviewStatus.PENDING,
      createdBy: user.profile?.email ?? customer?.email ?? user.sub,
      updatedBy: user.profile?.email ?? customer?.email ?? user.sub,
    });

    return mapProductReviewEntityToAdmin(entity, {
      productName: product.name,
      productImage: null,
    });
  }

  async updateStatus(
    refId: string,
    dto: UpdateProductReviewStatusDto,
    actor: string,
  ): Promise<IProductReview> {
    const existing = await this.reviewsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product review with refId ${refId} not found`);
    }

    if (
      dto.status !== ProductReviewStatus.APPROVED &&
      dto.status !== ProductReviewStatus.REJECTED &&
      dto.status !== ProductReviewStatus.PENDING
    ) {
      throw new BadRequestException('Invalid review status');
    }

    const updated = await this.reviewsRepository.updateByRefId(refId, {
      status: dto.status,
      moderatedBy: actor,
      moderatedAt: new Date(),
      updatedBy: actor,
    });

    if (!updated) {
      throw new NotFoundException(`Product review with refId ${refId} not found after update`);
    }

    const productImage = this.resolvePrimaryMedia(updated.product?.media);
    const item = mapProductReviewEntityToAdmin(updated, {
      productName: updated.product?.name ?? null,
      productImage,
    });

    return this.storageUrlEnricher.enrichFields(item, ['productImage']);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.reviewsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product review with refId ${refId} not found`);
    }
    await this.reviewsRepository.softDeleteByRefId(refId);
  }

  private async resolvePublishedProduct(slug: string) {
    const product =
      (await this.productsRepository.findPublishedBySlug(slug)) ??
      (await this.productsRepository.findPublishedByVariantSlug(slug));

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    return product;
  }

  private resolvePrimaryMedia(
    media: ProductMediaEntity[] | undefined,
  ): IProductReview['productImage'] {
    if (!media?.length) return null;
    const primary = media.find((item) => item.isPrimary) ?? media[0];
    return primary?.url ?? null;
  }

  private buildSummary(reviews: ProductReviewEntity[]): IPublicProductReviewSummary {
    const reviewsCount = reviews.length;
    const ratingsCount = reviewsCount;

    if (reviewsCount === 0) {
      return {
        averageRating: 0,
        ratingsCount: 0,
        reviewsCount: 0,
        breakdown: [5, 4, 3, 2, 1].map((rating) => ({ rating, percent: 0 })),
      };
    }

    const sum = reviews.reduce((acc, item) => acc + Number(item.rating), 0);
    const averageRating = Math.round((sum / reviewsCount) * 10) / 10;

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const item of reviews) {
      const rating = Number(item.rating);
      if (rating >= 1 && rating <= 5) {
        counts[rating] += 1;
      }
    }

    const breakdown = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      percent: Math.round((counts[rating] / reviewsCount) * 100),
    }));

    return {
      averageRating,
      ratingsCount,
      reviewsCount,
      breakdown,
    };
  }
}
