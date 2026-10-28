import { AdminSettingsService } from '@modules/admin-settings/services/admin-settings.service';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { CacheStrategyService } from '@packages/cache';
import { PincodesService } from '@modules/pincodes/services/pincodes.service';
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
    findPublishedByRefIds: jest.fn(),
    findPublishedPopularVariants: jest.fn(),
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
  const pincodesService = {
    resolveForStorefront: jest.fn(),
  };

  let service: PublicSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    pincodesService.resolveForStorefront.mockResolvedValue({ pincodeId: null, pincode: null });
    typesenseClient.isEnabled.mockReturnValue(false);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(false);
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);
    productsRepository.findPublishedByRefIds.mockResolvedValue([]);
    productsRepository.findPublishedPopularVariants.mockResolvedValue([]);
    brandsRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    categoriesRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    categoriesRepository.findActiveByRefIds.mockResolvedValue([]);
    categoriesRepository.findSlugPathById.mockResolvedValue([]);
    healthConcernsRepository.findPublicPaginated.mockResolvedValue({ data: [] });
    cacheStrategy.cacheAside.mockImplementation(async ({ loader }) => loader());

    service = new PublicSearchService(
      typesenseClient as unknown as TypesenseClientService,
      collectionService as unknown as TypesenseCollectionService,
      adminSettingsService as unknown as AdminSettingsService,
      productsRepository as unknown as ProductsRepository,
      brandsRepository as unknown as BrandsRepository,
      categoriesRepository as unknown as CategoriesRepository,
      healthConcernsRepository as unknown as HealthConcernsRepository,
      cacheStrategy as unknown as CacheStrategyService,
      pincodesService as unknown as PincodesService,
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

    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith('vit', 30, null);
    expect(results).toEqual([
      {
        entityType: SEARCH_ENTITY_TYPES.PRODUCT,
        title: 'Vitamin C 500mg',
        slug: 'vitamin-c-500',
        refId: 'PRD1',
        productPageUrl: '/shop/vitamin-c/',
      },
    ]);
  });

  it('puts a back acne title ahead of back pain titles', async () => {
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        displayName: 'Back Pain Relief Gel',
        slug: 'back-pain-relief-gel',
        product: { refId: 'PAIN', name: 'Back Pain Relief Gel', slug: 'back-pain-relief-gel' },
      },
      {
        displayName: 'Back Pain Support Belt',
        slug: 'back-pain-support-belt',
        product: { refId: 'BELT', name: 'Back Pain Support Belt', slug: 'back-pain-support-belt' },
      },
      {
        displayName: 'Back Acne Cream',
        slug: 'back-acne-cream',
        product: { refId: 'ACNE', name: 'Back Acne Cream', slug: 'back-acne-cream' },
      },
      {
        displayName: 'Acne Body Spray',
        slug: 'acne-body-spray',
        product: { refId: 'SPRAY', name: 'Acne Body Spray', slug: 'acne-body-spray' },
      },
    ]);

    const results = await service.search('back acne');

    expect(results.map((result) => result.refId)).toEqual(['ACNE', 'SPRAY', 'PAIN', 'BELT']);
  });

  it('returns native product matches for either normalized word in a multiword query', async () => {
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        displayName: 'Face Moisturizer',
        slug: 'face-moisturizer',
        product: { refId: 'MOIST', name: 'Face Moisturizer', slug: 'face-moisturizer' },
      },
      {
        displayName: 'Cream Cleanser',
        slug: 'cream-cleanser',
        product: { refId: 'CREAM', name: 'Cream Cleanser', slug: 'cream-cleanser' },
      },
    ]);

    const results = await service.search('  MOISTURIZER    cream  ');

    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith(
      'moisturizer cream',
      30,
      null,
    );
    expect(results.map((result) => result.refId)).toEqual(['MOIST', 'CREAM']);
  });

  it('keeps a native product matched through its brand even when its title does not contain the query', async () => {
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        displayName: 'Gentle Shampoo',
        slug: 'gentle-shampoo',
        product: { refId: 'BRAND-MATCH', name: 'Gentle Shampoo', slug: 'gentle-shampoo' },
      },
    ]);

    const results = await service.search('loreal');

    expect(results.map((result) => result.refId)).toContain('BRAND-MATCH');
  });

  it('passes the selected pincode into native product search', async () => {
    pincodesService.resolveForStorefront.mockResolvedValue({
      pincodeId: 'pin-other',
      pincode: '560001',
    });

    await service.search('vitamin', 10, '560001');

    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith(
      'vitamin',
      30,
      'pin-other',
    );
  });

  it('uses native fallback when Typesense client is up but admin flag is off', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(false);
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);

    await service.search('vit');

    expect(adminSettingsService.isTypesenseSearchEnabled).toHaveBeenCalled();
    expect(typesenseClient.getSearchClient).not.toHaveBeenCalled();
    expect(productsRepository.findPublishedDropdownSuggestions).toHaveBeenCalledWith('vit', 30, null);
  });
  it('searches Typesense products without an in-stock filter and ranks in-stock hits first', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasPopularSortField: false,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    const perform = jest.fn().mockResolvedValue({ results: [] });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
    });

    await service.search('vitamin', 10);

    const searches = perform.mock.calls[0][0].searches as Array<{
      filter_by?: string;
      sort_by?: string;
    }>;
    const productSearch = searches.find((search) => search.filter_by === 'entityType:=Product');
    expect(productSearch?.filter_by).toBe('entityType:=Product');
    expect(productSearch?.filter_by).not.toContain('inStock:true');
    expect(productSearch?.sort_by).toBe('inStock:desc,_text_match:desc');
  });

  it('queries each meaningful Typesense term and keeps full-query matches first', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
    const both = {
      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
      refId: 'BOTH',
      name: 'Face Moisturizer Cream',
      slug: 'face-moisturizer-cream',
    };
    const moisturizer = {
      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
      refId: 'MOIST',
      name: 'Face Moisturizer',
      slug: 'face-moisturizer',
    };
    const cream = {
      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
      refId: 'CREAM',
      name: 'Cream Cleanser',
      slug: 'cream-cleanser',
    };
    const products = [
      { refId: 'BOTH', variants: [{ slug: 'face-moisturizer-cream', displayName: 'Face Moisturizer Cream' }] },
      { refId: 'MOIST', variants: [{ slug: 'face-moisturizer', displayName: 'Face Moisturizer' }] },
      { refId: 'CREAM', variants: [{ slug: 'cream-cleanser', displayName: 'Cream Cleanser' }] },
    ];
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasSearchText: true,
      hasPopularSortField: false,
      productQueryBy: 'name,brand,category',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    const perform = jest.fn().mockImplementation(async ({ searches }: { searches: Array<{ q: string; query_by: string; filter_by?: string }> }) => ({
      results: searches.map(({ q, query_by }) => ({
        hits:
          q === 'moisturizer cream' && query_by !== 'name'
            ? [{ document: both }]
            : q === 'moisturizer'
              ? [{ document: moisturizer }]
              : q === 'cream' && query_by !== 'searchText'
                ? [{ document: cream }]
                : [],
      })),
    }));
    typesenseClient.getSearchClient.mockReturnValue({ multiSearch: { perform } });
    productsRepository.findPublishedByRefIds.mockResolvedValue(products);

    const results = await service.search('Moisturizer    Cream');

    const searches = perform.mock.calls[0]?.[0].searches as Array<{
      q: string;
      query_by: string;
      infix?: string;
    }>;
    const infixSearches = perform.mock.calls[1]?.[0].searches as Array<{
      q: string;
      query_by: string;
      infix?: string;
    }>;
    expect(searches.some((item) => item.q === 'moisturizer' && item.query_by !== 'searchText')).toBe(true);
    expect(infixSearches.some((item) => item.q === 'cream' && item.query_by === 'searchText' && item.infix === 'always')).toBe(true);
    expect(results.filter((item) => item.entityType === SEARCH_ENTITY_TYPES.PRODUCT).map((item) => item.refId)).toEqual([
      'BOTH',
      'MOIST',
      'CREAM',
    ]);
  });

  it('keeps Typesense matches on brand fields when the product title omits the query', async () => {
    const perform = enableTypesense(
      jest.fn().mockImplementation(async ({ searches }: { searches: Array<{ filter_by?: string }> }) => ({
        results: searches.map((search) => ({
          hits: search.filter_by === 'entityType:=Product'
            ? [{ document: {
                entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                refId: 'BRAND-MATCH',
                name: 'Gentle Shampoo',
                brand: "L'Oreal",
                slug: 'gentle-shampoo',
              } }]
            : [],
        })),
      })),
    );
    typesenseClient.getSearchClient.mockReturnValue({ multiSearch: { perform } });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'BRAND-MATCH',
        variants: [{ slug: 'gentle-shampoo', displayName: 'Gentle Shampoo' }],
      },
    ]);

    const results = await service.search('loreal');

    expect(results.map((result) => result.refId)).toContain('BRAND-MATCH');
  });

  it('uses Typesense infix matching for a four-character substring inside a word', async () => {
    const perform = enableTypesense(
      jest.fn().mockImplementation(async ({ searches }: { searches: Array<{ query_by: string }> }) => ({
        results: searches.map((search) => ({
          hits:
            search.query_by === 'searchText'
              ? [
                  {
                    document: {
                      entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                      refId: 'MOIST',
                      name: 'Moisturizer',
                      slug: 'moisturizer',
                    },
                  },
                ]
              : [],
        })),
      })),
    );
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasSearchText: true,
      hasPopularSortField: false,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    typesenseClient.getSearchClient.mockReturnValue({ multiSearch: { perform } });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      { refId: 'MOIST', variants: [{ slug: 'moisturizer', displayName: 'Moisturizer' }] },
    ]);

    const results = await service.search('oist');
    const searches = perform.mock.calls[1]?.[0].searches as Array<{
      q: string;
      query_by: string;
      infix?: string;
    }>;

    expect(searches).toContainEqual(expect.objectContaining({ q: 'oist', query_by: 'searchText', infix: 'always' }));
    expect(results.map((result) => result.refId)).toContain('MOIST');
  });

  it('drops a Typesense product that is not available for the selected pincode', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
    pincodesService.resolveForStorefront.mockResolvedValue({
      pincodeId: 'pin-other',
      pincode: '560001',
    });
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasIsPincodeManaged: true,
      hasPopularSortField: false,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    const perform = jest.fn().mockResolvedValue({
      results: [
        { hits: [] },
        { hits: [] },
        { hits: [] },
        {
          hits: [
            {
              document: {
                entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                refId: 'PRD-PIN',
                name: 'Vitamin Restricted',
                slug: 'vitamin-restricted',
                productPageUrl: '/shop/vitamin-restricted/',
              },
            },
          ],
        },
      ],
    });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([]);

    const results = await service.search('vitamin', 10, '560001');

    expect(productsRepository.findPublishedByRefIds).toHaveBeenCalledWith(['PRD-PIN'], 'pin-other');
    expect(results.filter((result) => result.entityType === SEARCH_ENTITY_TYPES.PRODUCT)).toEqual([]);
    const productSearch = perform.mock.calls[0][0].searches.find(
      (search: { filter_by?: string }) => search.filter_by?.includes('entityType:=Product'),
    );
    expect(productSearch?.filter_by).toContain('pincodes:=560001');
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

  function enableTypesense(perform = jest.fn().mockResolvedValue({ results: [] })) {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasPopularSortField: false,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    return perform;
  }

  it('joins spaced catalog words when the query leaves the space out', async () => {
    const perform = enableTypesense();
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasInStock: true,
      hasNameCompact: true,
      hasPopularSortField: false,
      productQueryBy: 'name,brand',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product',
        [SEARCH_ENTITY_TYPES.CATEGORY]: 'entityType:=Category',
        [SEARCH_ENTITY_TYPES.BRAND]: 'entityType:=Brand',
        [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: 'entityType:=Health Concern',
      },
    });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: jest.fn() }) }),
    });
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        displayName: 'Health etc Women Health Gummy',
        slug: 'health-etc-women-health-gummy',
        productPageUrl: '/shop/health-etc-women-health-gummy/',
        product: {
          refId: 'PRD-ETC',
          name: 'Health etc Women Health Gummy',
          slug: 'health-etc-women-health-gummy',
        },
      },
    ]);

    const results = await service.search('healthetc', 10);

    const searches = perform.mock.calls[0][0].searches as Array<{
      filter_by?: string;
      split_join_tokens?: string;
      query_by?: string;
    }>;
    const productSearch = searches.find((search) => search.filter_by === 'entityType:=Product');
    expect(productSearch?.split_join_tokens).toBe('always');
    expect(productSearch?.query_by).toContain('nameCompact');
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: SEARCH_ENTITY_TYPES.PRODUCT,
          title: 'Health etc Women Health Gummy',
          refId: 'PRD-ETC',
        }),
      ]),
    );
  });

  it('does not run tolerance search when the existing match already hits', async () => {
    const perform = enableTypesense(
      jest.fn().mockResolvedValue({
        results: [
          { hits: [] },
          { hits: [] },
          { hits: [] },
          {
            hits: [
              {
                document: {
                  entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                  refId: 'PRD1',
                  name: 'Cetaphil',
                  slug: 'cetaphil',
                },
              },
            ],
          },
        ],
      }),
    );
    const documentSearch = jest.fn();
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'PRD1',
        variants: [{ slug: 'cetaphil', sellingPrice: '10', displayName: 'Cetaphil' }],
      },
    ]);

    const results = await service.search('cetaphil');

    expect(perform).toHaveBeenCalledTimes(1);
    expect(documentSearch).not.toHaveBeenCalled();
    expect(results[0]).toEqual(expect.objectContaining({ title: 'Cetaphil', refId: 'PRD1' }));
  });

  it('keeps a one-character typo when Typesense already returned the product', async () => {
    const perform = enableTypesense(
      jest.fn().mockResolvedValue({
        results: [
          { hits: [] },
          { hits: [] },
          { hits: [] },
          {
            hits: [
              {
                document: {
                  entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                  refId: 'PRD1',
                  name: 'Cetaphil',
                  slug: 'cetaphil',
                },
              },
            ],
          },
        ],
      }),
    );
    const documentSearch = jest.fn();
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'PRD1',
        variants: [
          {
            slug: 'cetaphil',
            sellingPrice: '10',
            displayName: 'Cetaphil',
            productPageUrl: '/shop/cetaphil/',
          },
        ],
      },
    ]);

    const results = await service.search('setaphil');

    expect(documentSearch).not.toHaveBeenCalled();
    expect(results).toEqual([
      expect.objectContaining({
        entityType: SEARCH_ENTITY_TYPES.PRODUCT,
        title: 'Cetaphil',
        refId: 'PRD1',
      }),
    ]);
  });

  it('retries a spaced query as one compact token', async () => {
    const perform = enableTypesense();
    const documentSearch = jest.fn().mockResolvedValue({
      hits: [
        {
          document: {
            entityType: SEARCH_ENTITY_TYPES.PRODUCT,
            refId: 'PRD1',
            name: 'Cetaphil',
            slug: 'cetaphil',
          },
        },
      ],
    });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'PRD1',
        variants: [{ slug: 'cetaphil', sellingPrice: '10', displayName: 'Cetaphil' }],
      },
    ]);

    const results = await service.search('ceta phil');

    expect(documentSearch).toHaveBeenCalledWith(expect.objectContaining({ q: 'cetaphil' }));
    expect(results[0]).toEqual(expect.objectContaining({ title: 'Cetaphil', refId: 'PRD1' }));
  });

  it('returns a published product from the database when the title contains the query', async () => {
    const perform = enableTypesense(
      jest.fn().mockResolvedValue({ results: [{ hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }] }),
    );
    const documentSearch = jest.fn().mockResolvedValue({ hits: [] });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([
      {
        displayName: 'Cetaphil Serum TestSkin',
        slug: 'cetaphil-serum-testskin',
        productPageUrl: '/shop/cetaphil-serum-testskin/',
        product: { refId: 'CET1', name: 'Cetaphil Serum TestSkin', slug: 'cetaphil-serum-testskin' },
      },
    ]);

    const results = await service.search('cetaphil serum');

    expect(results[0]).toEqual(
      expect.objectContaining({
        title: 'Cetaphil Serum TestSkin',
        refId: 'CET1',
      }),
    );
    expect(documentSearch).not.toHaveBeenCalledWith(expect.objectContaining({ q: '*' }));
  });

  it('matches the longest word when the full phrase is not in a title', async () => {
    const perform = enableTypesense(jest.fn().mockResolvedValue({ results: [{ hits: [] }, { hits: [] }, { hits: [] }, { hits: [] }] }));
    const documentSearch = jest.fn().mockImplementation(async (params: { q?: string }) => {
      if (params.q !== 'cetaphil') return { hits: [] };
      return {
        hits: [
          {
            document: {
              entityType: SEARCH_ENTITY_TYPES.PRODUCT,
              refId: 'PRD1',
              name: 'Cetaphil Serum TestSkin',
              slug: 'cetaphil-serum',
            },
          },
        ],
      };
    });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'PRD1',
        variants: [{ slug: 'cetaphil-serum', sellingPrice: '10', displayName: 'Cetaphil Serum TestSkin' }],
      },
    ]);

    const results = await service.search('cetaphil serum');

    expect(documentSearch).toHaveBeenCalledWith(expect.objectContaining({ q: 'cetaphil' }));
    expect(documentSearch).not.toHaveBeenCalledWith(expect.objectContaining({ q: '*' }));
    expect(results[0]).toEqual(expect.objectContaining({ title: 'Cetaphil Serum TestSkin', refId: 'PRD1' }));
  });

  it('does not fill the dropdown with unrelated products when nothing matches', async () => {
    const perform = enableTypesense();
    const documentSearch = jest.fn().mockResolvedValue({ hits: [] });
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });

    await expect(service.search('iphone')).resolves.toEqual([]);
    expect(documentSearch).not.toHaveBeenCalledWith(expect.objectContaining({ q: '*' }));
  });

  it('returns an empty list for gibberish', async () => {
    const perform = enableTypesense();
    const documentSearch = jest.fn();
    typesenseClient.getSearchClient.mockReturnValue({
      multiSearch: { perform },
      collections: () => ({ documents: () => ({ search: documentSearch }) }),
    });

    await expect(service.search('asdfqwerzx')).resolves.toEqual([]);
    await expect(service.search('xqzplkmn')).resolves.toEqual([]);
    expect(documentSearch).not.toHaveBeenCalled();
  });
});

describe('PublicSearchService popular', () => {
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
    findPublishedByRefIds: jest.fn(),
    findPublishedPopularVariants: jest.fn(),
  };
  const brandsRepository = { findPublicPaginated: jest.fn() };
  const categoriesRepository = {
    findPublicPaginated: jest.fn(),
    findActiveByRefIds: jest.fn(),
    findSlugPathById: jest.fn(),
  };
  const healthConcernsRepository = { findPublicPaginated: jest.fn() };
  const cacheStrategy = {
    cacheAside: jest.fn(async ({ loader }) => loader()),
  };

  let service: PublicSearchService;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheStrategy.cacheAside.mockImplementation(async ({ loader }) => loader());
    productsRepository.findPublishedDropdownSuggestions.mockResolvedValue([]);
    productsRepository.findPublishedByRefIds.mockResolvedValue([]);
    productsRepository.findPublishedPopularVariants.mockResolvedValue([]);

    service = new PublicSearchService(
      typesenseClient as unknown as TypesenseClientService,
      collectionService as unknown as TypesenseCollectionService,
      adminSettingsService as unknown as AdminSettingsService,
      productsRepository as unknown as ProductsRepository,
      brandsRepository as unknown as BrandsRepository,
      categoriesRepository as unknown as CategoriesRepository,
      healthConcernsRepository as unknown as HealthConcernsRepository,
      cacheStrategy as unknown as CacheStrategyService,
      { resolveForStorefront: jest.fn().mockResolvedValue({ pincodeId: null, pincode: null }) } as unknown as PincodesService,
    );
  });

  it('falls back to published DB popular when Typesense is off', async () => {
    typesenseClient.isEnabled.mockReturnValue(false);
    productsRepository.findPublishedPopularVariants.mockResolvedValue([
      {
        slug: 'sellable-ors',
        displayName: 'Sellable ORS',
        productPageUrl: '/shop/sellable-ors/',
        product: { refId: 'PRD-LIVE', name: 'Sellable ORS', slug: 'sellable-ors' },
      },
    ]);

    await expect(service.getPopular(4)).resolves.toEqual([
      {
        entityType: SEARCH_ENTITY_TYPES.PRODUCT,
        title: 'Sellable ORS',
        slug: 'sellable-ors',
        refId: 'PRD-LIVE',
        productPageUrl: '/shop/sellable-ors/',
      },
    ]);
    expect(productsRepository.findPublishedPopularVariants).toHaveBeenCalledWith(4);
  });

  it('drops stale Typesense hits that are not sellable in Postgres', async () => {
    typesenseClient.isEnabled.mockReturnValue(true);
    adminSettingsService.isTypesenseSearchEnabled.mockResolvedValue(true);
    collectionService.getSearchRuntimeConfig.mockResolvedValue({
      hasEntityType: true,
      hasPopularSortField: true,
      productQueryBy: 'name',
      entityQueryBy: 'name',
      entityTypeFilters: {
        [SEARCH_ENTITY_TYPES.PRODUCT]: 'entityType:=Product && inStock:true',
      },
    });
    typesenseClient.getSearchClient.mockReturnValue({
      collections: () => ({
        documents: () => ({
          search: jest.fn().mockResolvedValue({
            hits: [
              {
                document: {
                  entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                  refId: 'OOS1',
                  name: 'Stale OOS',
                  slug: 'stale-oos',
                  productPageUrl: '/shop/stale-oos/',
                },
              },
              {
                document: {
                  entityType: SEARCH_ENTITY_TYPES.PRODUCT,
                  refId: 'LIVE1',
                  name: 'Live Product',
                  slug: 'live-product',
                  productPageUrl: '/shop/live-product/',
                },
              },
            ],
          }),
        }),
      }),
    });
    productsRepository.findPublishedByRefIds.mockResolvedValue([
      {
        refId: 'LIVE1',
        name: 'Live Product',
        slug: 'live-product',
        variants: [
          {
            slug: 'live-product',
            displayName: 'Live Product',
            productPageUrl: '/shop/live-product/',
            sellingPrice: '99',
            product: { refId: 'LIVE1', name: 'Live Product', slug: 'live-product' },
          },
        ],
      },
    ]);

    await expect(service.getPopular(4)).resolves.toEqual([
      {
        entityType: SEARCH_ENTITY_TYPES.PRODUCT,
        title: 'Live Product',
        slug: 'live-product',
        refId: 'LIVE1',
        productPageUrl: '/shop/live-product/',
      },
    ]);
    expect(productsRepository.findPublishedByRefIds).toHaveBeenCalledWith(['OOS1', 'LIVE1']);
    expect(productsRepository.findPublishedPopularVariants).toHaveBeenCalled();
  });
});
