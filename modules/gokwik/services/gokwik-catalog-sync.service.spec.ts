import { ConfigService } from '@nestjs/config';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { ProductType } from '@modules/product/enums/product-type.enum';
import { PromotionalPageStatus } from '@modules/promotional-pages/enums/promotional-page-status.enum';
import { PromotionalPageEntity } from '@modules/promotional-pages/entities/promotional-page.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { DataSource } from 'typeorm';
import { GokwikRepository } from '../repositories/gokwik.repository';
import { GokwikApiService } from './gokwik-api.service';
import { GokwikCatalogSyncService } from './gokwik-catalog-sync.service';
import { GokwikCollectionLockService } from './gokwik-collection-lock.service';
import { GokwikQueueService } from './gokwik-queue.service';
import { PRODUCT_MATCHES_CATEGORY_ENTITY_SQL } from '@modules/product/utils/product-category-hierarchies.util';

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

function collectionQueryBuilder() {
  const builder = {
    select: jest.fn(),
    distinct: jest.fn(),
    where: jest.fn(),
    setParameter: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getRawMany: jest.fn(async () => [
      { id: 'product-a' },
      { id: 'product-a' },
      { id: 'product-b' },
      { id: 'product-c' },
    ]),
  };
  builder.select.mockReturnValue(builder);
  builder.distinct.mockReturnValue(builder);
  builder.where.mockReturnValue(builder);
  builder.setParameter.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  builder.orderBy.mockReturnValue(builder);
  return builder;
}

function createService(options?: { category?: object | null; page?: object | null }) {
  const collectionQuery = collectionQueryBuilder();
  const categoryFindOne = jest.fn(async () =>
    options && 'category' in options
      ? options.category
      : {
          id: 'category-id',
          refId: 'CAT2026000001',
          slug: 'skin-care',
          name: 'Skin Care',
          updatedAt: new Date('2026-06-01T00:00:00.000Z'),
          deletedAt: null,
        },
  );
  const pageFindOne = jest.fn(async () => options?.page ?? null);
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === PromotionalPageEntity) {
        return { findOne: pageFindOne };
      }
      if (entity === CategoryEntity) {
        return { findOne: categoryFindOne };
      }
      return {
        findOne: jest.fn(async () => product),
        createQueryBuilder: jest.fn(() => collectionQuery),
      };
    }),
  };
  const apiService = {
    syncProducts: jest.fn(async (_payload: Record<string, unknown>) => ({ success: true })),
    syncCollections: jest.fn(async (_payload: Record<string, unknown>) => ({ success: true })),
  };
  const queueService = {
    enqueueProductSync: jest.fn(async () => undefined),
    enqueueCollectionSync: jest.fn(async () => undefined),
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
    queueService as unknown as GokwikQueueService,
    { toReference: jest.fn(async () => ({ url: 'https://cdn.test/cream.png' })) } as unknown as StorageUrlEnricher,
    {
      runExclusive: async (
        work: (assertOwned: () => Promise<void>) => Promise<unknown>,
      ) => work(async () => undefined),
    } as unknown as GokwikCollectionLockService,
  );
  return { service, apiService, collectionQuery, queueService, pageFindOne };
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

describe('GokwikCatalogSyncService', () => {
  it('does not send promotionType on product sync', async () => {
    const { service, apiService } = createService();

    await service.syncProduct('product-id');

    const payload = apiService.syncProducts.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('promotionType');
    expect(payload.id).toBe('product-id');
    expect(Object.keys(payload).sort()).toEqual([...existingProductFields].sort());
  });

  it('syncs a category collection with live product_ids and then enqueues those products', async () => {
    const { service, apiService, collectionQuery, queueService } = createService();

    await service.syncCollection('category-id');

    expect(collectionQuery.select).toHaveBeenCalledWith('product.id', 'id');
    expect(collectionQuery.where).toHaveBeenCalledWith(PRODUCT_MATCHES_CATEGORY_ENTITY_SQL);
    expect(collectionQuery.andWhere).toHaveBeenCalledWith('product.status = :published', {
      published: ProductStatus.PUBLISHED,
    });
    expect(collectionQuery.andWhere).toHaveBeenCalledWith(
      'product.productType IN (:...catalogProductTypes)',
      {
        catalogProductTypes: [ProductType.SIMPLE, ProductType.VARIABLE, ProductType.BUNDLE],
      },
    );
    expect(apiService.syncCollections).toHaveBeenCalledWith({
      id: 'category-id',
      handle: 'skin-care',
      title: 'Skin Care',
      name: 'Skin Care',
      product_ids: ['product-a', 'product-b', 'product-c'],
      updated_at: '2026-06-01T00:00:00.000Z',
      is_deleted: false,
    });
    expect(queueService.enqueueProductSync).toHaveBeenCalledWith('product-a');
    expect(queueService.enqueueProductSync).toHaveBeenCalledWith('product-b');
    expect(queueService.enqueueProductSync).toHaveBeenCalledWith('product-c');
  });

  it('syncs a promotional page as a GoKwik collection after member products', async () => {
    const page = {
      id: 'promo-page-id',
      refId: 'MON2026000001',
      slug: 'monthendoffer',
      name: 'Month End Offer',
      status: PromotionalPageStatus.PUBLISHED,
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
      deletedAt: null,
    };
    const { service, apiService, queueService } = createService({
      category: null,
      page,
    });

    await service.syncCollection('promo-page-id');

    expect(apiService.syncProducts).toHaveBeenCalled();
    expect(apiService.syncCollections).toHaveBeenCalledWith({
      id: 'promo-page-id',
      handle: 'monthendoffer',
      title: 'Month End Offer',
      name: 'Month End Offer',
      product_ids: ['product-a', 'product-b', 'product-c'],
      updated_at: '2026-06-01T00:00:00.000Z',
      is_deleted: false,
    });
    expect(queueService.enqueueProductSync).toHaveBeenCalled();
  });
});
