import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { BlogPostEntity } from '@modules/master/entities/blog-post.entity';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { PromotionalOfferEvaluationService } from '@modules/promotional-offers/services/promotional-offer-evaluation.service';
import { PromotionalPageReferenceService } from './promotional-page-reference.service';

describe('PromotionalPageReferenceService', () => {
  const productRows = { find: jest.fn() };
  const blogRows = { find: jest.fn() };
  const productsRepository = {};
  const brandsRepository = { findByRefIds: jest.fn() };
  const categoriesRepository = { findByRefIds: jest.fn(), findActiveByRefIds: jest.fn() };
  const couponsRepository = { findByRefId: jest.fn() };
  const promotionalOffers = { attachPublicOffersDeep: jest.fn(async () => undefined) };

  const service = new PromotionalPageReferenceService(
    productRows as unknown as Repository<ProductEntity>,
    blogRows as unknown as Repository<BlogPostEntity>,
    productsRepository as unknown as ProductsRepository,
    brandsRepository as unknown as BrandsRepository,
    categoriesRepository as unknown as CategoriesRepository,
    couponsRepository as unknown as CouponsRepository,
    promotionalOffers as unknown as PromotionalOfferEvaluationService,
  );

  const empty = {
    productRefIds: [] as string[],
    categoryRefIds: [] as string[],
    brandRefIds: [] as string[],
    blogRefIds: [] as string[],
    couponRefId: null,
  };

  beforeEach(() => {
    productRows.find.mockResolvedValue([]);
    blogRows.find.mockResolvedValue([]);
    brandsRepository.findByRefIds.mockResolvedValue([]);
    categoriesRepository.findByRefIds.mockResolvedValue([]);
    couponsRepository.findByRefId.mockResolvedValue(null);
  });

  it('rejects an unknown product', async () => {
    await expect(
      service.assertCatalogRefs({ ...empty, productRefIds: ['PRO2026000001'] }),
    ).rejects.toThrow('Invalid product reference(s): PRO2026000001');
  });

  it('rejects an unknown category', async () => {
    await expect(
      service.assertCatalogRefs({ ...empty, categoryRefIds: ['CAT2026000001'] }),
    ).rejects.toThrow('Invalid category reference(s): CAT2026000001');
  });

  it('rejects an unknown brand', async () => {
    await expect(
      service.assertCatalogRefs({ ...empty, brandRefIds: ['BRA2026000001'] }),
    ).rejects.toThrow('Invalid brand reference(s): BRA2026000001');
  });

  it('rejects an unknown blog', async () => {
    await expect(
      service.assertCatalogRefs({ ...empty, blogRefIds: ['BLO2026000001'] }),
    ).rejects.toThrow('Invalid blog reference(s): BLO2026000001');
  });

  it('rejects an unknown promotion', async () => {
    await expect(
      service.assertCatalogRefs({ ...empty, couponRefId: 'COU2026000001' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.assertCatalogRefs({ ...empty, couponRefId: 'COU2026000001' }),
    ).rejects.toThrow('Invalid promotion reference: COU2026000001');
  });

  it('accepts a live coupon reference', async () => {
    couponsRepository.findByRefId.mockResolvedValue({ id: 'coupon-id', refId: 'COU2026000001' });

    await expect(
      service.assertCatalogRefs({ ...empty, couponRefId: 'COU2026000001' }),
    ).resolves.toEqual({ couponId: 'coupon-id' });
  });
});
