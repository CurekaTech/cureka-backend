import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { PublicSearchService } from './public-search.service';
import { TypesenseClientService } from './typesense-client.service';
import { TypesenseCollectionService } from './typesense-collection.service';

describe('PublicSearchService native fallback', () => {
  const typesenseClient = {
    isEnabled: jest.fn(),
    getCollectionName: jest.fn().mockReturnValue('products'),
    getSearchClient: jest.fn(),
  };
  const collectionService = {
    getSearchRuntimeConfig: jest.fn(),
  };
  const productsRepository = {
    findPublishedDropdownSuggestions: jest.fn(),
  };
  const brandsRepository = {
    findPublicPaginated: jest.fn(),
  };
  const categoriesRepository = {
    findPublicPaginated: jest.fn(),
  };
  const healthConcernsRepository = {
    findPublicPaginated: jest.fn(),
  };

  const service = new PublicSearchService(
    typesenseClient as unknown as TypesenseClientService,
    collectionService as unknown as TypesenseCollectionService,
    productsRepository as unknown as ProductsRepository,
    brandsRepository as unknown as BrandsRepository,
    categoriesRepository as unknown as CategoriesRepository,
    healthConcernsRepository as unknown as HealthConcernsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    typesenseClient.isEnabled.mockReturnValue(false);
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);
    brandsRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    categoriesRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    healthConcernsRepository.findPublicPaginated.mockResolvedValue({ data: [] });
  });

  it('does not call native search until 3 characters when Typesense is down', async () => {
    await expect(service.search('vi')).resolves.toEqual([]);
    expect(productsRepository.findPublishedDropdownSuggestions).not.toHaveBeenCalled();
  });

  it('uses native suggestions after 3 characters when Typesense is down', async () => {
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        id: 'var-1',
        slug: 'vitamin-c-500',
        displayName: 'Vitamin C 500mg',
        productPageUrl: '/shop/vitamin-c/',
        product: { refId: 'PRD1', name: 'Vitamin C', slug: 'vitamin-c' },
      },
    ]);

    const results = await service.search('vit');

    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith('vit', 30);
    expect(results).toEqual([
      {
        entityType: SEARCH_ENTITY_TYPES.PRODUCT,
        title: 'Vitamin C 500mg',
        slug: 'vitamin-c-500',
        refId: 'PRD1',
        variantId: 'var-1',
        productPageUrl: '/shop/vitamin-c/',
      },
    ]);
  });

  it('falls back to native search when Typesense throws', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: false,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {},
    });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: {
        perform: jest.fn().mockRejectedValue(new Error('Typesense unavailable')),
      },
    });
    categoriesRepository.findPublicPaginated.mockResolvedValue({
      data: [{ name: 'Vitamins', slug: 'vitamins', refId: 'CAT1' }],
    });

    const results = await service.search('vita');

    expect(results[0]).toMatchObject({
      entityType: SEARCH_ENTITY_TYPES.CATEGORY,
      title: 'Vitamins',
      slug: 'vitamins',
      refId: 'CAT1',
    });
  });
});
