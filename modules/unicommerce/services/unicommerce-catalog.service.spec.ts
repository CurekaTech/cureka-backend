import { ConfigService } from '@nestjs/config';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { UnicommerceCatalogService } from './unicommerce-catalog.service';

describe('UnicommerceCatalogService', () => {
  const productsRepository = {
    countPublishedActiveVariants: jest.fn(),
    findPublishedProductsForUnicommerce: jest.fn(),
  } as unknown as ProductsRepository;

  const storageUrlEnricher = {
    toReference: jest.fn(),
  } as unknown as StorageUrlEnricher;

  const configService = {
    get: jest.fn(),
  } as unknown as ConfigService;

  const service = new UnicommerceCatalogService(
    productsRepository,
    storageUrlEnricher,
    configService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (configService.get as jest.Mock).mockReturnValue(undefined);
  });

  it('returns published variant count', async () => {
    (productsRepository.countPublishedActiveVariants as jest.Mock).mockResolvedValue(42);

    await expect(service.getProductsCount()).resolves.toEqual({ count: 42 });
  });

  it('returns mapped products for paginated query', async () => {
    (productsRepository.findPublishedProductsForUnicommerce as jest.Mock).mockResolvedValue([
      {
        refId: 'PRD-001',
        name: 'Vitamin C Serum',
        publishedAt: new Date('2026-01-02T08:12:53.000Z'),
        createdAt: new Date('2026-01-01T08:12:53.000Z'),
        brand: { name: 'Cureka Labs' },
        media: [],
        variants: [
          {
            id: 'variant-1',
            sku: 'VIT-C-30ML',
            slug: 'vitamin-c-serum-30ml',
            sellingPrice: '499.00',
            mrp: '699.00',
            stock: 25,
            length: '60',
            width: '40',
            height: '20',
            lengthUnit: 'mm',
            widthUnit: 'mm',
            heightUnit: 'mm',
            status: 'active',
            deletedAt: undefined,
            attributeValues: [],
          },
        ],
      },
    ]);

    const result = await service.getProducts({
      pageNumber: 1,
      pageSize: 50,
      publishedStatus: 'PUBLISHED',
      skus: 'VIT-C-30ML,OTHER',
    });

    expect(productsRepository.findPublishedProductsForUnicommerce).toHaveBeenCalledWith({
      page: 1,
      pageSize: 50,
      skus: ['VIT-C-30ML', 'OTHER'],
    });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe('PRD-001');
    expect(result.products[0]?.variants[0]?.sku).toBe('VIT-C-30ML');
  });
});
