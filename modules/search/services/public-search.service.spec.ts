import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { CacheStrategyService } from '@packages/cache';
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
  const adminSettingsService = {
    isTypesenseSearchEnabled: jest.fn(),
  };
  const productsRepository = {
    findPublishedDropdownSuggestions: jest.fn(),
  };
  const brandsRepository = {
    findPublicPaginated: jest.fn(),
  };
  const categoriesRepository = {
    findPublicPaginated: jest.fn(),
    findActiveByRefIds: jest.fn(),
    findSlugPathById: jest.fn(),
  };
  const healthConcernsRepository = {
    findPublicPaginated: jest.fn(),
  };
  const cacheStrategy = {
    cacheAside: jest.fn(),
  };

  let service: PublicSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    typesenseClient.isEnabled.mockReturnValue(false);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(false);
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);
    brandsRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    categoriesRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    categoriesRepository.findActiveByRefIds.mockResolvedValue([]);
    categoriesRepository.findSlugPathById.mockResolvedValue([]);
    healthConcernsRepository.findPublicPaginated.mockResolvedValue({ data: [] });

    service = new PublicSearchService(
      typesenseClient as unknown as TypesenseClientService,
      collectionService as unknown as TypesenseCollectionService,
      adminSettingsService as unknown as AdminSettingsService,
      productsRepository as unknown as ProductsRepository,
      brandsRepository as unknown as BrandsRepository,
      categoriesRepository as unknown as CategoriesRepository,
      healthConcernsRepository as unknown as HealthConcernsRepository,
      cacheStrategy as unknown as CacheStrategyService,
    );
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

  it('uses native fallback when Typesense client is up but admin flag is off', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(false);
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);

    await service.search('vit');

    expect(adminSettingsService.isTypesenseSearchEnabled).toHaveBeenCalled();
    expect(typesenseClient.getSearchClient).not.toHaveBeenCalled();
    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith('vit', 30);
  });
  it('falls back to native search when Typesense throws', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
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
      data: [{ name: 'Vitamins', slug: 'vitamins', refId: 'CAT1', status: MasterStatus.ACTIVE }],
    });
    categoriesRepository.findActiveByRefIds.mockResolvedValue([
      { id: 'cat-id-1', name: 'Vitamins', slug: 'vitamins', refId: 'CAT1' },
    ]);
    categoriesRepository.findSlugPathById.mockResolvedValue([
      'nutrition',
      'supplements',
      'vitamins',
    ]);

    const results = await service.search('vita');

    expect(results[0]).toMatchObject({
      entityType: SEARCH_ENTITY_TYPES.CATEGORY,
      title: 'Vitamins',
      slug: 'vitamins',
      refId: 'CAT1',
      permalink: '/product-category/nutrition/supplements/vitamins',
    });
  });

  it('filters inactive master records from native fallback results', async () => {
    categoriesRepository.findPublicPaginated.mockResolvedValue({
      data: [
        { name: 'Active Category', slug: 'active-category', refId: 'CAT1', status: MasterStatus.ACTIVE },
        { name: 'Inactive Category', slug: 'inactive-category', refId: 'CAT2', status: MasterStatus.INACTIVE },
      ],
    });
    categoriesRepository.findActiveByRefIds.mockResolvedValue([
      { id: 'cat-id-1', name: 'Active Category', slug: 'active-category', refId: 'CAT1' },
    ]);
    categoriesRepository.findSlugPathById.mockResolvedValue(['active-category']);
    brandsRepository.findPublicPaginated.mockResolvedValue({
      data: [
        { name: 'Active Brand', slug: 'active-brand', refId: 'BR1', status: MasterStatus.ACTIVE },
        { name: 'Inactive Brand', slug: 'inactive-brand', refId: 'BR2', status: MasterStatus.INACTIVE },
      ],
    });
    healthConcernsRepository.findPublicPaginated.mockResolvedValue({
      data: [
        { name: 'Active Concern', slug: 'active-concern', refId: 'HC1', status: MasterStatus.ACTIVE },
        { name: 'Inactive Concern', slug: 'inactive-concern', refId: 'HC2', status: MasterStatus.INACTIVE },
      ],
    });

    const results = await service.search('active', 10);

    expect(results).toEqual([
      {
        entityType: SEARCH_ENTITY_TYPES.CATEGORY,
        title: 'Active Category',
        slug: 'active-category',
        refId: 'CAT1',
        permalink: '/product-category/active-category',
      },
      {
        entityType: SEARCH_ENTITY_TYPES.BRAND,
        title: 'Active Brand',
        slug: 'active-brand',
        refId: 'BR1',
      },
      {
        entityType: SEARCH_ENTITY_TYPES.HEALTH_CONCERN,
        title: 'Active Concern',
        slug: 'active-concern',
        refId: 'HC1',
      },
    ]);
  });
});
