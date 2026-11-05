import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ProductReviewStatus } from '../enums/product-review-status.enum';
import { ProductReviewEntity } from '../entities/product-review.entity';
import { ProductReviewsService } from './product-reviews.service';

function review(partial: Partial<ProductReviewEntity>): ProductReviewEntity {
  return {
    id: partial.id ?? 'review-id',
    refId: partial.refId ?? 'REV1',
    productId: partial.productId ?? 'p1',
    rating: partial.rating ?? 5,
    review: partial.review ?? 'Title',
    status: partial.status ?? ProductReviewStatus.APPROVED,
    variantId: partial.variantId ?? null,
    customerName: partial.customerName ?? 'Asha',
    createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    ...partial,
  } as ProductReviewEntity;
}

const shopper = {
  sub: 'user-1',
  sessionId: 'session-1',
  role: 'customer',
  isGuest: false,
  isRegistered: true,
  status: 'active',
  profile: { email: 'asha@cureka.test' },
} as never;

function createService(options?: {
  productReviews?: ProductReviewEntity[];
  variantReviews?: ProductReviewEntity[];
  variantsById?: Record<string, { id: string; productId: string; sku: string } | null>;
  variantsBySlug?: Record<string, { id: string; productId: string; sku: string } | null>;
  ordered?: boolean;
  orderedVariant?: boolean;
  alreadyReviewed?: boolean;
  dateOfBirth?: Date | null;
  orderLocation?: { city: string; state: string } | null;
  defaultAddress?: { city: string; state: string } | null;
}) {
  const existingReview =
    options?.alreadyReviewed === true
      ? review({
          refId: 'EXISTING',
          userId: 'user-1',
          productId: 'p1',
          variantId: 'v1',
          rating: 4,
          review: 'Prior',
          reviewDescription: 'Prior details',
          status: ProductReviewStatus.APPROVED,
        })
      : null;
  const reviewsRepository = {
    findApprovedByProductId: jest.fn(async () => options?.productReviews ?? []),
    findApprovedByVariantId: jest.fn(async () => options?.variantReviews ?? []),
    create: jest.fn(async (data: Partial<ProductReviewEntity>) => data),
    existsByRefId: jest.fn(async () => false),
    existsByUserIdAndVariantId: jest.fn(async () => options?.alreadyReviewed === true),
    existsByUserIdAndProductId: jest.fn(async () => options?.alreadyReviewed === true),
    findByUserIdAndProductId: jest.fn(async () => existingReview),
    findByRefId: jest.fn(async (refId: string) =>
      existingReview && existingReview.refId === refId ? existingReview : null,
    ),
    updateByRefId: jest.fn(async (_refId: string, data: Partial<ProductReviewEntity>) => ({
      ...existingReview,
      ...data,
      productRefId: 'PR1',
    })),
  };
  const ordersService = {
    userHasOrderedProduct: jest.fn(async () => options?.ordered !== false),
    userHasOrderedProductVariant: jest.fn(async () => options?.orderedVariant !== false),
    findLatestOrderLocationForPurchase: jest.fn(async () => options?.orderLocation ?? null),
  };
  const userAddressesRepository = {
    findDefaultByUserId: jest.fn(async () => options?.defaultAddress ?? null),
  };
  const service = Object.create(ProductReviewsService.prototype) as ProductReviewsService;
  Object.assign(service, {
    reviewsRepository,
    productsRepository: {
      findPublishedBySlug: jest.fn(async () => ({ id: 'p1', refId: 'PR1', name: 'Serum' })),
      findPublishedByVariantSlug: jest.fn(async () => null),
    },
    variantsRepository: {
      findById: jest.fn(async (id: string) => options?.variantsById?.[id] ?? null),
      findActiveBySlug: jest.fn(async (slug: string) => options?.variantsBySlug?.[slug] ?? null),
    },
    usersRepository: {
      findById: jest.fn(async () => ({
        firstName: 'Asha',
        lastName: 'Rao',
        email: 'asha@cureka.test',
        dateOfBirth: options?.dateOfBirth === undefined ? new Date('1990-06-15') : options.dateOfBirth,
      })),
    },
    userAddressesRepository,
    ordersService,
    storageUrlEnricher: { enrichFields: jest.fn(async (item: unknown) => item) },
    eventEmitter: { emitAsync: jest.fn(async () => undefined) },
  });
  return { service, reviewsRepository, ordersService, userAddressesRepository };
}

describe('ProductReviewsService variant reviews', () => {
  const variant = { id: 'v1', productId: 'p1', sku: 'SKU-1' };

  it('uses only the selected variant approved reviews for the summary and the list', async () => {
    const variantReviews = [
      review({ id: 'a', refId: 'VAR-A', variantId: 'v1', rating: 5 }),
      review({ id: 'b', refId: 'VAR-B', variantId: 'v1', rating: 1 }),
    ];
    const { service, reviewsRepository } = createService({
      variantReviews,
      productReviews: [review({ id: 'other', variantId: 'v2', rating: 4 })],
      variantsById: { v1: variant },
    });

    const result = await service.findApprovedByProductSlug('serum', { variantId: 'v1' });

    expect(result.scope).toBe('variant');
    expect(result.variantId).toBe('v1');
    expect(result.reviews.map((item) => item.refId)).toEqual(['VAR-A', 'VAR-B']);
    expect(result.summary.reviewsCount).toBe(2);
    expect(result.summary.averageRating).toBe(3);
    expect(reviewsRepository.findApprovedByProductId).not.toHaveBeenCalled();
  });

  it('rejects a variant that belongs to another product', async () => {
    const { service } = createService({
      variantsById: { other: { id: 'other', productId: 'p2', sku: 'SKU-2' } },
    });

    await expect(
      service.findApprovedByProductSlug('serum', { variantId: 'other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a variant id that does not match the variant slug in the path', async () => {
    const { service } = createService({
      variantsById: { v2: { id: 'v2', productId: 'p1', sku: 'SKU-2' } },
      variantsBySlug: { 'serum-50': { id: 'v1', productId: 'p1', sku: 'SKU-1' } },
    });
    const productsRepository = (service as unknown as {
      productsRepository: {
        findPublishedBySlug: jest.Mock;
        findPublishedByVariantSlug: jest.Mock;
      };
    }).productsRepository;
    productsRepository.findPublishedBySlug.mockResolvedValue(null);
    productsRepository.findPublishedByVariantSlug.mockResolvedValue({
      id: 'p1',
      refId: 'PR1',
      name: 'Serum',
    });

    await expect(
      service.findApprovedByProductSlug('serum-50', { variantId: 'v2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects conflicting variantId and variant slug', async () => {
    const { service } = createService({
      variantsById: { v1: variant },
      variantsBySlug: { other: { id: 'v2', productId: 'p1', sku: 'SKU-2' } },
    });

    await expect(
      service.findApprovedByProductSlug('serum', { variantId: 'v1', variantSlug: 'other' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aggregates every approved review on the product, including variant and legacy rows', async () => {
    const productReviews = [
      review({ id: 'legacy', variantId: null, rating: 4 }),
      review({ id: 'on-variant', variantId: 'v1', rating: 2 }),
    ];
    const { service } = createService({ productReviews });

    const result = await service.findApprovedByProductSlug('serum');

    expect(result.scope).toBe('product');
    expect(result.variantId).toBeNull();
    expect(result.summary.reviewsCount).toBe(2);
    expect(result.summary.averageRating).toBe(3);
    expect(result.reviews).toHaveLength(2);
  });

  it('switches the summary, count, and list together when the variant has no approved reviews', async () => {
    const productReviews = [
      review({ id: 'legacy', rating: 5 }),
      review({ id: 'other-variant', variantId: 'v2', rating: 3 }),
    ];
    const { service } = createService({
      variantReviews: [],
      productReviews,
      variantsById: { v1: variant },
    });

    const result = await service.findApprovedByProductSlug('serum', { variantId: 'v1' });

    expect(result.scope).toBe('product');
    expect(result.variantId).toBeNull();
    expect(result.summary.reviewsCount).toBe(2);
    expect(result.summary.ratingsCount).toBe(2);
    expect(result.summary.averageRating).toBe(4);
    expect(result.reviews).toHaveLength(2);
  });

  it('drops pending and rejected rows from the public set', async () => {
    const { service } = createService({
      variantReviews: [
        review({ id: 'ok', rating: 5, status: ProductReviewStatus.APPROVED, refId: 'OK1' }),
        review({ id: 'wait', rating: 1, status: ProductReviewStatus.PENDING, refId: 'PEND' }),
        review({ id: 'no', rating: 2, status: ProductReviewStatus.REJECTED, refId: 'REJ' }),
      ],
      variantsById: { v1: variant },
    });

    const result = await service.findApprovedByProductSlug('serum', { variantId: 'v1' });

    expect(result.scope).toBe('variant');
    expect(result.reviews.map((item) => item.refId)).toEqual(['OK1']);
    expect(result.summary.averageRating).toBe(5);
    expect(result.summary.reviewsCount).toBe(1);
  });

  it('requires a signed-in shopper and stores that user on a pending review', async () => {
    const { service, reviewsRepository } = createService({
      variantsById: { v1: variant },
      orderLocation: { city: 'Ahmedabad', state: 'Gujarat' },
    });

    await expect(
      service.createForProductSlug('serum', {
        rating: 5,
        review: 'Works well',
        reviewDescription: 'Helpful details',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(reviewsRepository.create).not.toHaveBeenCalled();

    await service.createForProductSlug(
      'serum',
      {
        rating: 5,
        review: 'Works well',
        reviewDescription: 'Helpful details',
        variantId: 'v1',
      },
      shopper,
    );

    expect(reviewsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        status: ProductReviewStatus.PENDING,
        variantId: 'v1',
        variantSku: 'SKU-1',
        review: 'Works well',
        reviewDescription: 'Helpful details',
        customerAge: expect.any(String),
        customerLocation: 'Ahmedabad, Gujarat',
      }),
    );
  });

  it('derives age from DOB and ignores client age/location fields', async () => {
    const { service, reviewsRepository } = createService({
      variantsById: { v1: variant },
      dateOfBirth: new Date(Date.UTC(1994, 0, 1)),
      orderLocation: { city: 'Pune', state: 'Maharashtra' },
    });

    await service.createForProductSlug(
      'serum',
      {
        rating: 4,
        review: 'Good',
        reviewDescription: 'Nice product',
        variantId: 'v1',
        customerAge: '99',
        customerLocation: 'Somewhere Else',
      } as never,
      shopper,
    );

    const created = reviewsRepository.create.mock.calls[0][0] as Partial<ProductReviewEntity>;
    expect(created.customerAge).not.toBe('99');
    expect(created.customerLocation).toBe('Pune, Maharashtra');
    expect(created.customerAge).toMatch(/^\d+$/);
  });

  it('falls back to default address city/state when the order has no usable location', async () => {
    const { service, reviewsRepository, userAddressesRepository } = createService({
      variantsById: { v1: variant },
      orderLocation: { city: '  ', state: '' },
      defaultAddress: { city: 'Surat', state: 'Gujarat' },
    });

    await service.createForProductSlug(
      'serum',
      {
        rating: 5,
        review: 'Great',
        reviewDescription: 'Details',
        variantId: 'v1',
      },
      shopper,
    );

    expect(userAddressesRepository.findDefaultByUserId).toHaveBeenCalledWith('user-1');
    expect(reviewsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerLocation: 'Surat, Gujarat' }),
    );
  });

  it('stores null location when order and default address lack city/state', async () => {
    const { service, reviewsRepository } = createService({
      variantsById: { v1: variant },
      orderLocation: null,
      defaultAddress: null,
      dateOfBirth: null,
    });

    await service.createForProductSlug(
      'serum',
      {
        rating: 5,
        review: 'Ok',
        reviewDescription: 'Details',
        variantId: 'v1',
      },
      shopper,
    );

    expect(reviewsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerAge: null,
        customerLocation: null,
      }),
    );
  });

  it('rejects a second review for the same user and product', async () => {
    const { service } = createService({
      variantsById: { v1: variant },
      alreadyReviewed: true,
    });

    await expect(
      service.createForProductSlug(
        'serum',
        {
          rating: 5,
          review: 'Again',
          reviewDescription: 'Duplicate',
          variantId: 'v1',
        },
        shopper,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('can-review is false with existingReview after any prior review for that product', async () => {
    const sibling = { id: 'v2', productId: 'p1', sku: 'SKU-2' };
    const { service } = createService({
      variantsById: { v1: variant, v2: sibling },
      alreadyReviewed: true,
    });

    await expect(
      service.canReviewForProductSlug('serum', shopper, { variantId: 'v1' }),
    ).resolves.toEqual({
      canReview: false,
      existingReview: expect.objectContaining({ refId: 'EXISTING', rating: 4 }),
    });

    await expect(
      service.canReviewForProductSlug('serum', shopper, { variantId: 'v2' }),
    ).resolves.toEqual({
      canReview: false,
      existingReview: expect.objectContaining({ refId: 'EXISTING' }),
    });
  });

  it('can-review is false when the product was not ordered', async () => {
    const { service } = createService({
      variantsById: { v1: variant },
      ordered: false,
    });

    await expect(
      service.canReviewForProductSlug('serum', shopper, { variantId: 'v1' }),
    ).resolves.toEqual({ canReview: false, existingReview: null });
  });

  it('lets the owner update their existing review and resets status to pending', async () => {
    const { service, reviewsRepository } = createService({
      variantsById: { v1: variant },
      alreadyReviewed: true,
    });

    const updated = await service.updateMyReviewForProductSlug(
      'serum',
      'EXISTING',
      {
        rating: 5,
        review: 'Updated title',
        reviewDescription: 'Updated details',
        variantId: 'v1',
      },
      shopper,
    );

    expect(reviewsRepository.updateByRefId).toHaveBeenCalledWith(
      'EXISTING',
      expect.objectContaining({
        rating: 5,
        review: 'Updated title',
        reviewDescription: 'Updated details',
        status: ProductReviewStatus.PENDING,
        moderatedBy: null,
        moderatedAt: null,
      }),
    );
    expect(updated.rating).toBe(5);
  });

  it('forbids editing another customer’s review', async () => {
    const { service, reviewsRepository } = createService({ alreadyReviewed: true });
    reviewsRepository.findByRefId.mockResolvedValueOnce(
      review({
        refId: 'EXISTING',
        userId: 'someone-else',
        productId: 'p1',
      }),
    );

    await expect(
      service.updateMyReviewForProductSlug(
        'serum',
        'EXISTING',
        { rating: 3, review: 'Nope', reviewDescription: 'Not mine' },
        shopper,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('variant review migration rollback', () => {
  it('counts null user ids and raises before dropping any column', () => {
    const source = readFileSync(
      join(__dirname, '../../../apps/api/database/migrations/1786024000000-add-variant-level-product-reviews.ts'),
      'utf8',
    );
    const down = source.slice(source.indexOf('async down'));
    const guard = down.indexOf('user_id" IS NULL');
    const raise = down.indexOf('RAISE EXCEPTION');
    const restore = down.indexOf('SET NOT NULL');
    const drop = down.indexOf('DROP COLUMN');

    expect(guard).toBeGreaterThan(-1);
    expect(raise).toBeGreaterThan(guard);
    expect(restore).toBeGreaterThan(raise);
    expect(drop).toBeGreaterThan(restore);
  });
});

describe('user-variant unique migration', () => {
  it('creates a partial unique index on user_id and variant_id', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../apps/api/database/migrations/1786025000000-add-product-reviews-user-variant-unique.ts',
      ),
      'utf8',
    );
    expect(source).toContain('UQ_product_reviews_user_variant_active');
    expect(source).toContain('"user_id" IS NOT NULL');
    expect(source).toContain('"variant_id" IS NOT NULL');
    expect(source).toContain('"deleted_at" IS NULL');
    expect(source).toContain('PARTITION BY user_id, variant_id');
    expect(source).toContain('ranked.rn > 1');
  });
});

describe('user-product unique migration', () => {
  it('replaces variant uniqueness with a partial unique index on user_id and product_id', () => {
    const source = readFileSync(
      join(
        __dirname,
        '../../../apps/api/database/migrations/1786028000000-product-reviews-one-per-user-product.ts',
      ),
      'utf8',
    );
    expect(source).toContain('DROP INDEX IF EXISTS "UQ_product_reviews_user_variant_active"');
    expect(source).toContain('UQ_product_reviews_user_product_active');
    expect(source).toContain('"user_id" IS NOT NULL');
    expect(source).toContain('"product_id"');
    expect(source).toContain('"deleted_at" IS NULL');
    expect(source).toContain('PARTITION BY user_id, product_id');
  });
});
