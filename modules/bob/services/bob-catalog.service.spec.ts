import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { ProductVariantsRepository } from '@modules/product/repositories/product-variants.repository';
import { ProductsService } from '@modules/product/services/products.service';
import { StorageService } from '@packages/storage';
import { BobCatalogService } from './bob-catalog.service';
import { BobProductResolver } from './bob-product-resolver.service';

const CATEGORY_ID = '08b35486-05f3-4de2-9c05-b107252dd890';
const PRODUCT_UUID = 'c4e9b094-30f1-4ca5-aaec-0e0b60631ab6';
const REF_ID = 'LAC2026514080';
const CATALOGUE_ID = '217301';
const VARIANT_UUID = '5a545f0f-f96c-44b5-bea5-88542d7796b6';

function product(overrides: Partial<ProductEntity> = {}): ProductEntity {
  return {
    id: PRODUCT_UUID,
    refId: REF_ID,
    externalProductId: CATALOGUE_ID,
    name: 'Lactisyn Sachets (10 x 1gm Sachet)',
    status: ProductStatus.PUBLISHED,
    description: 'Lactisyn Sachets (10 x 1gm Sachet)',
    slug: 'lactisyn-sachets-10x1gm-sachet',
    tagMappings: [],
    media: [],
    variants: [
      {
        id: VARIANT_UUID,
        productId: PRODUCT_UUID,
        status: VariantStatus.ACTIVE,
        sellingPrice: '532',
        stock: 3,
        sku: 'NUT/LAC/08623',
        attributeValues: [],
        inCurekaInventory: false,
      } as unknown as ProductVariantEntity,
    ],
    ...overrides,
  } as ProductEntity;
}

describe('GET /api/v1/bob/categories/:categoryId/products', () => {
  let categoriesRepository: {
    findById: jest.Mock;
    findByRefId: jest.Mock;
    findActiveByHierarchyId: jest.Mock;
  };
  let productsRepository: {
    findPublishedRefIdsByCategoryId: jest.Mock;
    findPublishedByRefIds: jest.Mock;
    findPublishedByIds: jest.Mock;
    findPublishedById: jest.Mock;
    findWithTagsById: jest.Mock;
    findPublishedRefIdsForBobCatalog: jest.Mock;
  };
  let productVariantsRepository: { findById: jest.Mock };
  let productsService: { replaceTags: jest.Mock };
  let resolver: {
    findPublishedByBobId: jest.Mock;
    findPublishedByBobIds: jest.Mock;
    findIdByBobIdentifier: jest.Mock;
  };
  let service: BobCatalogService;

  beforeEach(() => {
    categoriesRepository = {
      findById: jest.fn().mockResolvedValue({ id: CATEGORY_ID, name: 'Anti dandruff shampoo' }),
      findByRefId: jest.fn(),
      findActiveByHierarchyId: jest.fn().mockResolvedValue({
        id: CATEGORY_ID,
        hierarchyId: 1042,
        name: 'Preterm Formula',
      }),
    };
    productsRepository = {
      findPublishedRefIdsByCategoryId: jest.fn().mockResolvedValue([]),
      findPublishedByRefIds: jest.fn().mockResolvedValue([]),
      findPublishedByIds: jest.fn().mockResolvedValue([]),
      findPublishedById: jest.fn(),
      findWithTagsById: jest.fn(),
      findPublishedRefIdsForBobCatalog: jest.fn().mockResolvedValue({ refIds: [], total: 0 }),
    };
    productVariantsRepository = { findById: jest.fn() };
    productsService = { replaceTags: jest.fn().mockResolvedValue(undefined) };
    resolver = {
      findPublishedByBobId: jest.fn(),
      findPublishedByBobIds: jest.fn().mockResolvedValue([]),
      findIdByBobIdentifier: jest.fn(),
    };
    service = new BobCatalogService(
      categoriesRepository as unknown as CategoriesRepository,
      productsRepository as unknown as ProductsRepository,
      productVariantsRepository as unknown as ProductVariantsRepository,
      productsService as unknown as ProductsService,
      { toFileReferenceResponses: jest.fn().mockResolvedValue([]) } as unknown as StorageService,
      { get: jest.fn().mockReturnValue('https://www.cureka.com') } as unknown as ConfigService,
      resolver as unknown as BobProductResolver,
    );
  });

  it('returns the catalogue id and omits products that have none', async () => {
    const listed = product();
    const missing = product({
      id: 'b62c4f03-1fe8-4fb5-8e3a-4106afc7b055',
      refId: 'ZER2026047034',
      externalProductId: null,
      name: 'Zeroharm Trans-Resveratrol 250 mg Capsules (60 NOS)',
    });
    const malformed = product({
      id: 'a23aa7d2-6f80-4314-91ec-2c3f823e8b27',
      refId: 'BAD2026047034',
      externalProductId: 'SKU-123',
    });
    productsRepository.findPublishedRefIdsByCategoryId.mockResolvedValue([
      listed.refId,
      missing.refId,
      malformed.refId,
    ]);
    productsRepository.findPublishedByRefIds.mockResolvedValue([listed, missing, malformed]);

    const result = await service.listProductsByCategory(CATEGORY_ID);

    expect(result).toEqual([
      {
        id: 217301,
        title: 'Lactisyn Sachets (10 x 1gm Sachet)',
        status: 'ACTIVE',
        tags: [],
      },
    ]);
    expect(result.map((item) => item.id)).not.toContain(PRODUCT_UUID);
    expect(listed.id).toBe(PRODUCT_UUID);
  });

  it('loads the same category products by numeric hierarchy id', async () => {
    productsRepository.findPublishedRefIdsByCategoryId.mockResolvedValue([]);

    await service.listProductsByCategory('1042');

    expect(categoriesRepository.findActiveByHierarchyId).toHaveBeenCalledWith(1042);
    expect(categoriesRepository.findById).not.toHaveBeenCalled();
    expect(productsRepository.findPublishedRefIdsByCategoryId).toHaveBeenCalledWith(CATEGORY_ID);
  });

  it('includes reported catalogue ids in both category and full product listings', async () => {
    const rows = [
      product({ id: '10000000-0000-4000-8000-000000000001', refId: 'LAC20260001', externalProductId: '16833', publishedAt: null }),
      product({ id: '10000000-0000-4000-8000-000000000002', refId: 'LAC20260002', externalProductId: '17189', publishedAt: null }),
      product({ id: '10000000-0000-4000-8000-000000000003', refId: 'LAC20260003', externalProductId: '17193', publishedAt: null }),
    ];
    const refIds = rows.map((row) => row.refId);
    categoriesRepository.findById.mockResolvedValue({ id: CATEGORY_ID, name: 'Products' });
    productsRepository.findPublishedRefIdsByCategoryId.mockResolvedValue(refIds);
    productsRepository.findPublishedRefIdsForBobCatalog.mockResolvedValue({
      refIds,
      total: refIds.length,
    });
    productsRepository.findPublishedByRefIds.mockImplementation(async (requested: string[]) =>
      rows.filter((row) => requested.includes(row.refId)),
    );

    const categoryProducts = await service.listProductsByCategory(CATEGORY_ID);
    const allProducts = await service.listProducts();

    expect(categoryProducts.map((item) => item.id)).toEqual([16833, 17189, 17193]);
    expect(allProducts.products.map((item) => item.id)).toEqual(categoryProducts.map((item) => item.id));
    expect(allProducts).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 3,
        total: 3,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
    );
  });

  it('loads product detail by UUID, refId, and catalogue id', async () => {
    const row = product();
    resolver.findPublishedByBobId.mockResolvedValue(row);

    for (const identifier of [PRODUCT_UUID, REF_ID, CATALOGUE_ID]) {
      const detail = await service.getProduct(identifier);
      expect(detail.id).toBe(217301);
      expect(detail.variants[0]?.id).toBe(VARIANT_UUID);
    }
    expect(resolver.findPublishedByBobId).toHaveBeenNthCalledWith(1, PRODUCT_UUID);
    expect(resolver.findPublishedByBobId).toHaveBeenNthCalledWith(2, REF_ID);
    expect(resolver.findPublishedByBobId).toHaveBeenNthCalledWith(3, CATALOGUE_ID);
  });

  it('loads the full catalog without the Unicommerce publishedAt ref-id query', async () => {
    productsRepository.findPublishedRefIdsForBobCatalog.mockResolvedValue({
      refIds: [REF_ID],
      total: 1,
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([product()]);

    const result = await service.listProducts();

    expect(productsRepository.findPublishedRefIdsForBobCatalog).toHaveBeenCalledWith({
      search: undefined,
      page: undefined,
      limit: undefined,
    });
    expect(productsRepository.findPublishedByIds).not.toHaveBeenCalled();
    expect(result.products.map((item) => item.id)).toEqual([217301]);
    expect(result).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
    );
  });

  it('passes search text and paging to the catalogue query and does not load the full list', async () => {
    productsRepository.findPublishedRefIdsForBobCatalog.mockResolvedValue({
      refIds: [REF_ID],
      total: 48,
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([product()]);

    const result = await service.listProducts({ search: 'lactisyn', page: 2, limit: 20 });

    expect(productsRepository.findPublishedRefIdsForBobCatalog).toHaveBeenCalledWith({
      search: 'lactisyn',
      page: 2,
      limit: 20,
    });
    expect(productsRepository.findPublishedByRefIds).toHaveBeenCalledWith([REF_ID]);
    expect(result.products.map((item) => item.id)).toEqual([217301]);
    expect(result).toEqual(
      expect.objectContaining({
        page: 2,
        limit: 20,
        total: 48,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: true,
      }),
    );
  });

  it('pages a search that has no explicit page size', async () => {
    productsRepository.findPublishedRefIdsForBobCatalog.mockResolvedValue({
      refIds: [],
      total: 0,
    });

    const result = await service.listProducts({ q: 'shampoo' });

    expect(productsRepository.findPublishedRefIdsForBobCatalog).toHaveBeenCalledWith({
      search: 'shampoo',
      page: 1,
      limit: 20,
    });
    expect(result).toEqual(
      expect.objectContaining({
        products: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
    );
  });

  it('lists products by mixed catalogue ids without exposing internal UUIDs', async () => {
    const second = product({
      id: '9959d0e2-10f4-47cd-b3ec-eab19bc21e67',
      refId: 'NAT2026369886',
      externalProductId: '217482',
      name: 'Natvie 400 Capsule (3 x 15 Capsules )',
      slug: 'natvie-400',
    });
    resolver.findPublishedByBobIds.mockResolvedValue([product(), second]);

    const result = await service.listProducts({ ids: `${CATALOGUE_ID},217482` });

    expect(resolver.findPublishedByBobIds).toHaveBeenCalledWith([CATALOGUE_ID, '217482']);
    expect(result.products.map((item) => item.id)).toEqual([217301, 217482]);
    expect(result).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 2,
        total: 2,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
    );
  });

  it('returns consistent inventory across full list, ids list, product detail, and variant detail', async () => {
    const row = product();
    const variant = row.variants[0] as ProductVariantEntity;
    variant.stock = -4;
    variant.outOfStock = true;
    variant.inCurekaInventory = false;
    categoriesRepository.findById.mockResolvedValue({ id: CATEGORY_ID, name: 'Products' });
    productsRepository.findPublishedRefIdsByCategoryId.mockResolvedValue([row.refId]);
    productsRepository.findPublishedRefIdsForBobCatalog.mockResolvedValue({
      refIds: [row.refId],
      total: 1,
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([row]);
    productsRepository.findPublishedById.mockResolvedValue(row);
    productVariantsRepository.findById.mockResolvedValue(variant);
    resolver.findPublishedByBobId.mockResolvedValue(row);
    resolver.findPublishedByBobIds.mockResolvedValue([row]);

    const categoryItems = await service.listProductsByCategory(CATEGORY_ID);
    const fullList = await service.listProducts();
    const idsList = await service.listProducts({ ids: CATALOGUE_ID });
    const productDetail = await service.getProduct(CATALOGUE_ID);
    const variantDetail = await service.getVariant(VARIANT_UUID);
    const inventory = { inventoryQuantity: 0, inventoryPolicy: 'deny', inventoryManaged: true };

    expect(categoryItems.map((item) => item.id)).toEqual([217301]);
    expect(categoryItems[0]).not.toHaveProperty('variants');
    for (const detail of [fullList.products[0], idsList.products[0], productDetail]) {
      expect(detail?.variants[0]).toEqual(expect.objectContaining(inventory));
    }
    expect(variantDetail).toEqual(expect.objectContaining(inventory));
  });

  it('updates tags through the internal UUID and returns the catalogue id', async () => {
    const row = product({
      tagMappings: [{ tag: { name: 'hair' } }] as ProductEntity['tagMappings'],
    });
    resolver.findIdByBobIdentifier.mockResolvedValue(PRODUCT_UUID);
    productsRepository.findWithTagsById.mockResolvedValue(row);

    const result = await service.updateTags(CATALOGUE_ID, ['hair']);

    expect(productsService.replaceTags).toHaveBeenCalledWith(PRODUCT_UUID, ['hair'], 'bob');
    expect(result).toEqual({
      id: 217301,
      title: 'Lactisyn Sachets (10 x 1gm Sachet)',
      status: 'ACTIVE',
      tags: ['hair'],
    });
  });

  it('keeps variant lookup on the variant UUID', async () => {
    productVariantsRepository.findById.mockResolvedValue(product().variants[0]);
    productsRepository.findPublishedById.mockResolvedValue(product());

    const result = await service.getVariant(VARIANT_UUID);

    expect(result.id).toBe(VARIANT_UUID);
    expect(result.product.id).toBe(217301);
  });

  it('rejects a variant whose product has no catalogue id', async () => {
    productVariantsRepository.findById.mockResolvedValue(product().variants[0]);
    productsRepository.findPublishedById.mockResolvedValue(product({ externalProductId: '  ' }));

    await expect(service.getVariant(VARIANT_UUID)).rejects.toBeInstanceOf(NotFoundException);
  });
});
