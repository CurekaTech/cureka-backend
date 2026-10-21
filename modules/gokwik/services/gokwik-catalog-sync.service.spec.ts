import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { PromotionalPageType } from '@modules/promotional-pages/enums/promotional-page-type.enum';
import { PromotionalPageEntity } from '@modules/promotional-pages/entities/promotional-page.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { DataSource } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikCatalogSyncService } from './gokwik-catalog-sync.service';
import { GokwikQueueService } from './gokwik-queue.service';

const product = {
  id: 'product-id',
  refId: 'PRO2026000001',
  name: 'Evion Cream',
  slug: 'evion-cream',
  description: 'Cream',
  status: ProductStatus.PUBLISHED,
  updatedAt: new Date('2026-06-01T00:00:00.000Z'),
  deletedAt: null,
  variants: [
    {
      id: 'variant-id',
      deletedAt: null,
      displayName: '20gm',
      slug: '20gm',
      sku: 'EVION-20',
      sellingPrice: 99,
      mrp: 120,
      stock: 4,
    },
  ],
  media: [{ id: 'image-id', url: 'media/cream.png', variantId: 'variant-id' }],
  tagMappings: [],
};

function queryBuilder(rows: { promotionType: PromotionalPageType }[]) {
  const builder = {
    select: jest.fn(),
    distinct: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    setParameters: jest.fn(),
    getRawMany: jest.fn(async () => rows),
  };
  builder.select.mockReturnValue(builder);
  builder.distinct.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  builder.setParameters.mockReturnValue(builder);
  return builder;
}

function createService(promotionRows: { promotionType: PromotionalPageType }[]) {
  const promotionQuery = queryBuilder(promotionRows);
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === PromotionalPageEntity) {
        return { createQueryBuilder: jest.fn(() => promotionQuery) };
      }
      if (entity === CategoryEntity) {
        return {
          findOne: jest.fn(async () => ({
            id: 'category-id',
            refId: 'CAT2026000001',
            slug: 'skin-care',
            name: 'Skin Care',
            updatedAt: new Date('2026-06-01T00:00:00.000Z'),
            deletedAt: null,
          })),
        };
      }
      return {
        findOne: jest.fn(async () => product),
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getRawMany: jest.fn(async () => [{ id: 'product-id' }]),
        })),
      };
    }),
  };
  const apiService = {
    syncProducts: jest.fn(async (_payload: Record<string, unknown>) => ({ success: true })),
    syncCollections: jest.fn(async (_payload: Record<string, unknown>) => ({ success: true })),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'gokwik.catalogSyncEnabled') return true;
      if (key === 'gokwik.baseUrl') return 'https://gokwik.test';
      if (key === 'gokwik.appId') return 'app';
      if (key === 'gokwik.appSecret') return 'secret';
      return undefined;
    }),
  };
  const service = new GokwikCatalogSyncService(
    dataSource as unknown as DataSource,
    configService as unknown as ConfigService,
    apiService as unknown as GokwikApiService,
    { markSyncState: jest.fn(async () => undefined) } as unknown as GokwikRepository,
    {} as GokwikQueueService,
    { toReference: jest.fn(async () => ({ url: 'https://cdn.test/cream.png' })) } as unknown as StorageUrlEnricher,
  );
  return { service, apiService, promotionQuery };
}

const existingProductFields = [
  'id',
  'title',
  'status',
  'tags',
  'updated_at',
  'handle',
  'body_html',
  'is_deleted',
  'variants',
  'images',
];

describe('GokwikCatalogSyncService promotion type', () => {
  it('adds promotionType for a product on a non-default promotion', async () => {
    const { service, apiService } = createService([
      { promotionType: PromotionalPageType.MONTH_END },
    ]);

    await service.syncProduct('product-id');

    const payload = apiService.syncProducts.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.promotionType).toBe('month-end');
    expect(payload.id).toBe('product-id');
    expect(payload.handle).toBe('evion-cream');
    expect(payload.variants).toEqual([
      expect.objectContaining({ id: 'variant-id', sku: 'EVION-20', price: 99 }),
    ]);
    for (const field of existingProductFields) {
      expect(payload).toHaveProperty(field);
    }
  });

  it('leaves the product payload unchanged for the default promotion type', async () => {
    const { service, apiService } = createService([]);

    await service.syncProduct('product-id');

    const payload = apiService.syncProducts.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('promotionType');
    expect(Object.keys(payload).sort()).toEqual([...existingProductFields].sort());
  });

  it('leaves the product payload unchanged when the product has no promotion', async () => {
    const { service, apiService } = createService([]);

    await service.syncProduct('product-id');

    expect(apiService.syncProducts.mock.calls[0]?.[0]).not.toHaveProperty('promotionType');
  });

  it('omits promotionType when non-default promotion types disagree', async () => {
    const { service, apiService } = createService([
      { promotionType: PromotionalPageType.MONTH_END },
      { promotionType: 'seasonal' as PromotionalPageType },
    ]);

    await service.syncProduct('product-id');

    expect(apiService.syncProducts.mock.calls[0]?.[0]).not.toHaveProperty('promotionType');
  });

  it('does not add promotionType to the collection sync payload', async () => {
    const { service, apiService } = createService([
      { promotionType: PromotionalPageType.MONTH_END },
    ]);

    await service.syncCollection('category-id');

    expect(apiService.syncCollections).toHaveBeenCalledWith({
      id: 'category-id',
      handle: 'skin-care',
      title: 'Skin Care',
      product_ids: ['product-id'],
      updated_at: '2026-06-01T00:00:00.000Z',
    });
  });
});
