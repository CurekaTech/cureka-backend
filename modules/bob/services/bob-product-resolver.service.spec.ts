import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { Repository } from 'typeorm';
import { BobProductResolver } from './bob-product-resolver.service';

const PRODUCT_UUID = 'c4e9b094-30f1-4ca5-aaec-0e0b60631ab6';
const REF_ID = 'LAC2026514080';
const CATALOGUE_ID = '217301';

function product(overrides: Partial<ProductEntity> = {}): ProductEntity {
  return {
    id: PRODUCT_UUID,
    refId: REF_ID,
    externalProductId: CATALOGUE_ID,
    name: 'Lactisyn Sachets (10 x 1gm Sachet)',
    ...overrides,
  } as ProductEntity;
}

describe('BobProductResolver', () => {
  let productsRepository: {
    findPublishedByIds: jest.Mock;
    findPublishedByRefIds: jest.Mock;
  };
  let products: { find: jest.Mock; findOne: jest.Mock };
  let resolver: BobProductResolver;

  beforeEach(() => {
    productsRepository = {
      findPublishedByIds: jest.fn().mockResolvedValue([]),
      findPublishedByRefIds: jest.fn().mockResolvedValue([]),
    };
    products = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    resolver = new BobProductResolver(
      productsRepository as unknown as ProductsRepository,
      products as unknown as Repository<ProductEntity>,
    );
  });

  it('resolves a published product by internal UUID', async () => {
    const row = product();
    productsRepository.findPublishedByIds.mockResolvedValue([row]);

    await expect(resolver.findPublishedByBobId(PRODUCT_UUID)).resolves.toBe(row);
    expect(productsRepository.findPublishedByRefIds).not.toHaveBeenCalled();
    expect(products.find).not.toHaveBeenCalled();
  });

  it('resolves a published product by refId before catalogue id', async () => {
    const row = product();
    productsRepository.findPublishedByRefIds.mockResolvedValue([row]);

    await expect(resolver.findPublishedByBobId(REF_ID)).resolves.toBe(row);
    expect(products.find).not.toHaveBeenCalled();
  });

  it('resolves a catalogue id when it is not a UUID or refId', async () => {
    const row = product();
    productsRepository.findPublishedByIds.mockImplementation(async (ids: string[]) =>
      ids.includes(PRODUCT_UUID) ? [row] : [],
    );
    products.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.externalProductId) {
        return [{ id: PRODUCT_UUID, externalProductId: CATALOGUE_ID }];
      }
      return [];
    });

    await expect(resolver.findPublishedByBobId(CATALOGUE_ID)).resolves.toBe(row);
  });

  it('does not treat a reserved refId as another product catalogue id', async () => {
    products.find.mockResolvedValue([{ refId: 'ZER2026047034' }]);

    await expect(resolver.findPublishedByBobIds(['ZER2026047034'])).resolves.toEqual([]);
    expect(productsRepository.findPublishedByIds).not.toHaveBeenCalled();
  });

  it('omits a UUID match that has no catalogue id', async () => {
    productsRepository.findPublishedByIds.mockResolvedValue([
      product({ externalProductId: null }),
    ]);

    await expect(resolver.findPublishedByBobId(PRODUCT_UUID)).resolves.toBeNull();
  });

  it('resolves mixed UUID, refId, and catalogue ids in request order', async () => {
    const byUuid = product({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      refId: 'AAA2026000001',
      externalProductId: '100',
    });
    const byRef = product({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      refId: 'BBB2026000002',
      externalProductId: '200',
    });
    const byCatalogue = product();
    productsRepository.findPublishedByIds.mockImplementation(async (ids: string[]) =>
      [byUuid, byCatalogue].filter((row) => ids.includes(row.id)),
    );
    productsRepository.findPublishedByRefIds.mockResolvedValue([byRef]);
    products.find.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.externalProductId) {
        return [{ id: PRODUCT_UUID, externalProductId: CATALOGUE_ID }];
      }
      return [];
    });

    await expect(
      resolver.findPublishedByBobIds([byUuid.id, byRef.refId, CATALOGUE_ID]),
    ).resolves.toEqual([byUuid, byRef, byCatalogue]);
  });

  it('resolves tag-update ids by UUID, refId, or catalogue id', async () => {
    products.findOne.mockImplementation(async ({ where }: { where: Record<string, string> }) => {
      if (where.id === PRODUCT_UUID || where.refId === REF_ID || where.externalProductId === CATALOGUE_ID) {
        return product();
      }
      if (where.refId === 'ZER2026047034') {
        return product({
          id: 'b62c4f03-1fe8-4fb5-8e3a-4106afc7b055',
          refId: 'ZER2026047034',
          externalProductId: null,
        });
      }
      return null;
    });

    await expect(resolver.findIdByBobIdentifier(PRODUCT_UUID)).resolves.toBe(PRODUCT_UUID);
    await expect(resolver.findIdByBobIdentifier(REF_ID)).resolves.toBe(PRODUCT_UUID);
    await expect(resolver.findIdByBobIdentifier(CATALOGUE_ID)).resolves.toBe(PRODUCT_UUID);
    await expect(resolver.findIdByBobIdentifier('ZER2026047034')).resolves.toBeNull();
  });
});
