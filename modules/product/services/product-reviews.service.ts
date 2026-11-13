import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ProductUpdatedEvent } from '@packages/events';
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
import { UserAddressesRepository } from '@modules/users/repositories/user-addresses.repository';
import {
  CreateProductReviewDto,
  ProductReviewQueryDto,
  PublicProductReviewQueryDto,
  UpdateMyProductReviewDto,
  UpdateProductReviewStatusDto,
} from '../dto/product-review.dto';
import { ProductReviewStatus } from '../enums/product-review-status.enum';
import {
  IMyProductReviewSnapshot,
  IProductReview,
  IProductReviewEligibility,
  IPublicProductReviewsResponse,
  IPublicProductReviewSummary,
  PublicProductReviewScope,
} from '../interfaces/product-review.interface';
import {
  mapProductReviewEntityToAdmin,
  mapProductReviewEntityToPublic,
} from '../mappers/product-review.mapper';
import { ProductReviewsRepository } from '../repositories/product-reviews.repository';
import { ProductVariantsRepository } from '../repositories/product-variants.repository';
import { ProductReviewEntity } from '../entities/product-review.entity';
import { ProductEntity } from '../entities/product.entity';
import { ProductVariantEntity } from '../entities/product-variant.entity';
import {
  calculateAgeYears,
  formatReviewLocation,
} from '../utils/customer-review-profile.util';

@Injectable()
export class ProductReviewsService {
  constructor(
    private readonly reviewsRepository: ProductReviewsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly variantsRepository: ProductVariantsRepository,
    private readonly usersRepository: UsersRepository,
    private readonly userAddressesRepository: UserAddressesRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
    private readonly eventEmitter: EventEmitter2,
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

  async findApprovedByProductSlug(
    slug: string,
    query?: PublicProductReviewQueryDto,
  ): Promise<IPublicProductReviewsResponse> {
    const { product, variant } = await this.resolvePublishedProductContext(slug, query);
    const selected = await this.selectApprovedReviewSet(product.id, variant);

    return {
      summary: this.buildSummary(selected.reviews),
      reviews: selected.reviews.map(mapProductReviewEntityToPublic),
      scope: selected.scope,
      variantId: selected.scope === 'variant' ? (variant?.id ?? null) : null,
    };
  }

  async canReviewForProductSlug(
    slug: string,
    user?: IUserSessionContext,
    query?: PublicProductReviewQueryDto,
  ): Promise<IProductReviewEligibility> {
    if (!user?.isRegistered || !user.sub) {
      return { canReview: false, existingReview: null };
    }

    const { product } = await this.resolveReviewableProductContext(slug, query);
    const existing = await this.reviewsRepository.findByUserIdAndProductId(user.sub, product.id);
    const existingReview = existing ? this.mapMyReviewSnapshot(existing) : null;

    if (existingReview) {
      return { canReview: false, existingReview };
    }

    const hasDelivered = await this.ordersService.userHasDeliveredProduct(user.sub, product.id);
    return { canReview: hasDelivered, existingReview: null };
  }

  async createForProductSlug(
    slug: string,
    dto: CreateProductReviewDto,
    user?: IUserSessionContext,
  ) {
    if (!user?.isRegistered || !user.sub) {
      throw new ForbiddenException('Please sign in to submit a product review');
    }

    const { product, variant } = await this.resolveReviewableProductContext(slug, dto);

    const hasDelivered = await this.ordersService.userHasDeliveredProduct(user.sub, product.id);
    if (!hasDelivered) {
      throw new ForbiddenException(
        'Only customers with a delivered order of this product can submit a review',
      );
    }

    const alreadyReviewed = await this.reviewsRepository.existsByUserIdAndProductId(
      user.sub,
      product.id,
    );
    if (alreadyReviewed) {
      throw new ConflictException(
        'You have already submitted a review for this product. Edit your existing review instead.',
      );
    }

    const { rating, reviewText, reviewDescription } = this.parseReviewContent(dto);

    const customer = await this.usersRepository.findById(user.sub);
    const customerName =
      [customer?.firstName, customer?.lastName].filter(Boolean).join(' ').trim() ||
      customer?.email ||
      user.profile?.email ||
      'Customer';

    const ageYears = calculateAgeYears(customer?.dateOfBirth);
    const customerAge = ageYears != null ? String(ageYears) : null;
    const customerLocation = await this.resolveReviewLocation(
      user.sub,
      product.id,
      variant?.id ?? null,
    );

    const refId = await generateUniqueRefId(reviewText.slice(0, 20), (id) =>
      this.reviewsRepository.existsByRefId(id),
    );

    const actor = user.profile?.email ?? customer?.email ?? user.sub;

    let entity: ProductReviewEntity;
    try {
      entity = await this.reviewsRepository.create({
        refId,
        productId: product.id,
        productRefId: product.refId,
        variantId: variant?.id ?? null,
        variantSku: variant?.sku ?? null,
        userId: user.sub,
        customerName,
        rating,
        review: reviewText,
        reviewDescription,
        customerAge,
        customerLocation,
        status: ProductReviewStatus.PENDING,
        createdBy: actor,
        updatedBy: actor,
      });
    } catch (error) {
      if (this.isUniqueUserProductViolation(error)) {
        throw new ConflictException(
          'You have already submitted a review for this product. Edit your existing review instead.',
        );
      }
      throw error;
    }

    return mapProductReviewEntityToAdmin(entity, {
      productName: product.name,
      productImage: null,
    });
  }

  async updateMyReviewForProductSlug(
    slug: string,
    refId: string,
    dto: UpdateMyProductReviewDto,
    user?: IUserSessionContext,
  ): Promise<IProductReview> {
    if (!user?.isRegistered || !user.sub) {
      throw new ForbiddenException('Please sign in to edit your product review');
    }

    const { product, variant } = await this.resolveReviewableProductContext(slug, dto);
    const existing = await this.reviewsRepository.findByRefId(refId);
    if (!existing || existing.productId !== product.id) {
      throw new NotFoundException(`Product review with refId ${refId} not found`);
    }
    if (existing.userId !== user.sub) {
      throw new ForbiddenException('You can only edit your own review');
    }

    const { rating, reviewText, reviewDescription } = this.parseReviewContent(dto);
    const actor = user.profile?.email ?? user.sub;
    const contentChanged =
      existing.rating !== rating ||
      (existing.review ?? '') !== reviewText ||
      (existing.reviewDescription ?? '') !== reviewDescription;

    const updated = await this.reviewsRepository.updateByRefId(refId, {
      rating,
      review: reviewText,
      reviewDescription,
      ...(variant
        ? { variantId: variant.id, variantSku: variant.sku }
        : {}),
      ...(contentChanged
        ? {
            status: ProductReviewStatus.PENDING,
            moderatedBy: null,
            moderatedAt: null,
          }
        : {}),
      updatedBy: actor,
    });

    if (!updated) {
      throw new NotFoundException(`Product review with refId ${refId} not found after update`);
    }

    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(updated.productRefId, 'updated'),
    );

    return mapProductReviewEntityToAdmin(updated, {
      productName: product.name,
      productImage: null,
    });
  }

  private async resolveReviewLocation(
    userId: string,
    productId: string,
    variantId: string | null,
  ): Promise<string | null> {
    const orderLocation = await this.ordersService.findLatestOrderLocationForPurchase(
      userId,
      productId,
      variantId,
    );
    const fromOrder = formatReviewLocation(orderLocation ?? {});
    if (fromOrder) return fromOrder;

    const defaultAddress = await this.userAddressesRepository.findDefaultByUserId(userId);
    return formatReviewLocation({
      city: defaultAddress?.city,
      state: defaultAddress?.state,
    });
  }

  private parseReviewContent(dto: {
    rating: number;
    review: string;
    reviewDescription: string;
  }): { rating: number; reviewText: string; reviewDescription: string } {
    const rating = Number(dto.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Rating must be an integer between 1 and 5');
    }

    const reviewText = dto.review?.trim();
    if (!reviewText) {
      throw new BadRequestException('Review title is required');
    }

    const reviewDescription = dto.reviewDescription?.trim();
    if (!reviewDescription) {
      throw new BadRequestException('Review description is required');
    }

    return { rating, reviewText, reviewDescription };
  }

  private mapMyReviewSnapshot(entity: ProductReviewEntity): IMyProductReviewSnapshot {
    return {
      refId: entity.refId,
      rating: entity.rating,
      review: entity.review,
      reviewDescription: entity.reviewDescription ?? null,
      status: entity.status,
      variantId: entity.variantId ?? null,
    };
  }

  private isUniqueUserProductViolation(error: unknown): boolean {
    const driver =
      error && typeof error === 'object' && 'driverError' in error
        ? (error as { driverError?: { code?: string; constraint?: string; message?: string } })
            .driverError
        : (error as { code?: string; constraint?: string; message?: string } | null);

    if (driver?.code !== '23505') return false;
    const haystack = `${driver.constraint ?? ''} ${driver.message ?? ''}`;
    return (
      haystack.includes('UQ_product_reviews_user_product_active') ||
      haystack.includes('UQ_product_reviews_user_variant_active')
    );
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

    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(updated.productRefId, 'updated'),
    );

    return this.storageUrlEnricher.enrichFields(item, ['productImage']);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.reviewsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Product review with refId ${refId} not found`);
    }
    await this.reviewsRepository.softDeleteByRefId(refId);
    await this.eventEmitter.emitAsync(
      EVENTS.PRODUCT_UPDATED,
      new ProductUpdatedEvent(existing.productRefId, 'updated'),
    );
  }

  private async resolvePublishedProduct(slug: string): Promise<ProductEntity> {
    const { product } = await this.resolvePublishedProductContext(slug);
    return product;
  }

  /** Review create/edit/eligibility: product may be unpublished or out of stock. */
  private async resolveReviewableProductContext(
    slug: string,
    query?: { variantId?: string; variantSlug?: string },
  ): Promise<{ product: ProductEntity; variant: ProductVariantEntity | null }> {
    const productBySlug = await this.productsRepository.findBySlugAnyStatus(slug);
    let product = productBySlug;
    let slugVariant: ProductVariantEntity | null = null;

    if (!product) {
      product = await this.productsRepository.findByVariantSlugAnyStatus(slug);
      if (product) {
        slugVariant = await this.variantsRepository.findActiveBySlug(slug);
        if (slugVariant && slugVariant.productId !== product.id) {
          slugVariant = null;
        }
      }
    }

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    const variant = await this.resolveRequestedVariant(product.id, {
      variantId: query?.variantId,
      variantSlug: query?.variantSlug,
      fallback: slugVariant,
    });

    if (slugVariant && variant && slugVariant.id !== variant.id) {
      throw new BadRequestException('variantId and variantSlug identify different variants');
    }

    return { product, variant };
  }

  private async resolvePublishedProductContext(
    slug: string,
    query?: { variantId?: string; variantSlug?: string },
  ): Promise<{ product: ProductEntity; variant: ProductVariantEntity | null }> {
    const productBySlug = await this.productsRepository.findPublishedBySlug(slug);
    let product = productBySlug;
    let slugVariant: ProductVariantEntity | null = null;

    if (!product) {
      product = await this.productsRepository.findPublishedByVariantSlug(slug);
      if (product) {
        slugVariant = await this.variantsRepository.findActiveBySlug(slug);
        if (slugVariant && slugVariant.productId !== product.id) {
          slugVariant = null;
        }
      }
    }

    if (!product) {
      throw new NotFoundException(`Product with slug ${slug} not found`);
    }

    const variant = await this.resolveRequestedVariant(product.id, {
      variantId: query?.variantId,
      variantSlug: query?.variantSlug,
      fallback: slugVariant,
    });

    if (slugVariant && variant && slugVariant.id !== variant.id) {
      throw new BadRequestException('variantId and variantSlug identify different variants');
    }

    return { product, variant };
  }

  private async resolveRequestedVariant(
    productId: string,
    input: {
      variantId?: string;
      variantSlug?: string;
      fallback: ProductVariantEntity | null;
    },
  ): Promise<ProductVariantEntity | null> {
    const byId = input.variantId
      ? await this.requireVariantForProduct(await this.variantsRepository.findById(input.variantId), productId, input.variantId)
      : null;
    const bySlug = input.variantSlug
      ? await this.requireVariantForProduct(
          await this.variantsRepository.findActiveBySlug(input.variantSlug),
          productId,
          input.variantSlug,
        )
      : null;

    if (byId && bySlug && byId.id !== bySlug.id) {
      throw new BadRequestException('variantId and variantSlug identify different variants');
    }

    return byId ?? bySlug ?? input.fallback;
  }

  private async requireVariantForProduct(
    variant: ProductVariantEntity | null,
    productId: string,
    requested: string,
  ): Promise<ProductVariantEntity> {
    if (!variant) {
      throw new NotFoundException(`Variant ${requested} not found`);
    }
    if (variant.productId !== productId) {
      throw new BadRequestException('Variant does not belong to this product');
    }
    return variant;
  }

  /**
   * Variant reviews and the product aggregate are never mixed.
   * Zero approved rows for the selected variant replaces the whole set.
   */
  private async selectApprovedReviewSet(
    productId: string,
    variant: ProductVariantEntity | null,
  ): Promise<{ reviews: ProductReviewEntity[]; scope: PublicProductReviewScope }> {
    if (variant) {
      const variantReviews = this.onlyApproved(
        await this.reviewsRepository.findApprovedByVariantId(variant.id),
      );
      if (variantReviews.length > 0) {
        return { reviews: variantReviews, scope: 'variant' };
      }
    }

    return {
      reviews: this.onlyApproved(await this.reviewsRepository.findApprovedByProductId(productId)),
      scope: 'product',
    };
  }

  private onlyApproved(reviews: ProductReviewEntity[]): ProductReviewEntity[] {
    return reviews.filter((review) => review.status === ProductReviewStatus.APPROVED);
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
