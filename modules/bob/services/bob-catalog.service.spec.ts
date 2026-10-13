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
    findAllPublishedRefIds: jest.Mock;
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
      findAllPublishedRefIds: jest.fn().mockResolvedValue([]),
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
    productsRepository.findPublishedRefIdsByCategoryId.mockResolvedValue([
      listed.refId,
      missing.refId,
    ]);
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      { id: listed.id, refId: listed.refId },
      { id: missing.id, refId: missing.refId },
    ]);
    productsRepository.findPublishedByIds.mockResolvedValue([listed, missing]);

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

  it('lists products by mixed catalogue ids without exposing internal UUIDs', async () => {
    const second = product({
      id: '9959d0e2-10f4-47cd-b3ec-eab19bc21e67',
      refId: 'NAT2026369886',
      externalProductId: '217482',
      name: 'Natvie 400 Capsule (3 x 15 Capsules )',
      slug: 'natvie-400',
    });
    resolver.findPublishedByBobIds.mockResolvedValue([product(), second]);

    const result = await service.listProducts(`${CATALOGUE_ID},217482`);

    expect(resolver.findPublishedByBobIds).toHaveBeenCalledWith([CATALOGUE_ID, '217482']);
    expect(result.map((item) => item.id)).toEqual([217301, 217482]);
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
