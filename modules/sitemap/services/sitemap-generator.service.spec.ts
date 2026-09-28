import { ConfigService } from '@nestjs/config';
import { SitemapDirtyService } from './sitemap-dirty.service';
import { SitemapGeneratorService } from './sitemap-generator.service';
import { SitemapQueryService } from './sitemap-query.service';
import { SitemapStorageService } from './sitemap-storage.service';
import { SitemapXmlValidationError } from './sitemap-xml.builder';

describe('SitemapGeneratorService publish safety', () => {
  const queryService = {
    getStaticEntries: jest.fn(),
    iterateProductEntries: jest.fn(),
    collectCategoryEntries: jest.fn(),
    collectBrandEntries: jest.fn(),
    collectHealthConcernEntries: jest.fn(),
    collectWellnessGoalEntries: jest.fn(),
    collectCollectionEntries: jest.fn(),
    collectBlogEntries: jest.fn(),
    collectSupportEntries: jest.fn(),
    collectCmsEntries: jest.fn(),
  };
  const storageService = {
    cleanupStaleStaging: jest.fn(),
    writeStagingXml: jest.fn(),
    publishLive: jest.fn(),
    deleteStaging: jest.fn(),
    listLive: jest.fn(),
    existsLive: jest.fn(),
    readLiveText: jest.fn(),
  };
  const dirtyService = {
    consumeDirty: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string): string | number | undefined => {
      if (key === 'sitemap.baseUrl') return 'https://www.cureka.com';
      if (key === 'sitemap.batchSize') return 10_000;
      if (key === 'sitemap.maxUrlsPerFile') return 50_000;
      return undefined;
    }),
  };

  const generator = new SitemapGeneratorService(
    configService as unknown as ConfigService,
    queryService as unknown as SitemapQueryService,
    storageService as unknown as SitemapStorageService,
    dirtyService as unknown as SitemapDirtyService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string): string | number | undefined => {
      if (key === 'sitemap.baseUrl') return 'https://www.cureka.com';
      if (key === 'sitemap.batchSize') return 10_000;
      if (key === 'sitemap.maxUrlsPerFile') return 50_000;
      return undefined;
    });
    storageService.cleanupStaleStaging.mockResolvedValue(undefined);
    storageService.writeStagingXml.mockResolvedValue(undefined);
    storageService.publishLive.mockResolvedValue(undefined);
    storageService.deleteStaging.mockResolvedValue(undefined);
    storageService.listLive.mockResolvedValue([]);
    storageService.existsLive.mockResolvedValue(false);
    storageService.readLiveText.mockResolvedValue(null);
    dirtyService.consumeDirty.mockResolvedValue(true);
    queryService.getStaticEntries.mockReturnValue([{ locPath: '/' }]);
    queryService.iterateProductEntries.mockImplementation(async function* () {
      yield { locPath: '/shop/a', lastmod: new Date('2026-01-01T00:00:00Z') };
    });
    queryService.collectCategoryEntries.mockResolvedValue([]);
    queryService.collectBrandEntries.mockResolvedValue([]);
    queryService.collectHealthConcernEntries.mockResolvedValue([]);
    queryService.collectWellnessGoalEntries.mockResolvedValue([]);
    queryService.collectCollectionEntries.mockResolvedValue([]);
    queryService.collectBlogEntries.mockResolvedValue([]);
    queryService.collectSupportEntries.mockResolvedValue([]);
    queryService.collectCmsEntries.mockResolvedValue([]);
  });

  it('does not publish live files when XML validation fails', async () => {
    storageService.writeStagingXml.mockRejectedValueOnce(new SitemapXmlValidationError('bad xml'));
    await expect(generator.generateGroup('static')).rejects.toBeInstanceOf(SitemapXmlValidationError);
    expect(storageService.publishLive).not.toHaveBeenCalled();
    expect(storageService.deleteStaging).toHaveBeenCalled();
  });

  it('publishes product shards then the index', async () => {
    queryService.iterateProductEntries.mockImplementation(async function* () {
      yield { locPath: '/shop/a', lastmod: new Date('2026-01-01T00:00:00Z') };
      yield { locPath: '/shop/b', lastmod: new Date('2026-01-02T00:00:00Z') };
    });
    configService.get.mockImplementation((key: string): string | number | undefined => {
      if (key === 'sitemap.baseUrl') return 'https://www.cureka.com';
      if (key === 'sitemap.batchSize') return 10_000;
      if (key === 'sitemap.maxUrlsPerFile') return 1;
      return undefined;
    });

    await generator.generateGroup('products');

    expect(storageService.publishLive).toHaveBeenCalledWith(
      expect.objectContaining({
        childRelativePaths: ['products/products-1.xml', 'products/products-2.xml'],
        indexRelativePath: 'sitemap.xml',
      }),
    );
  });

  it('drops an emptied group from the index instead of listing its stale live file', async () => {
    // Live store still holds support.xml from an earlier run; support now has 0 entries
    // and its file is pruned after publish, so the index must not reference it.
    storageService.listLive.mockResolvedValue(['static.xml', 'brands.xml', 'support.xml']);
    queryService.collectSupportEntries.mockResolvedValue([]);

    await generator.generateGroup('support');

    const indexCall = storageService.writeStagingXml.mock.calls.find(
      ([, relativePath]) => relativePath === 'sitemap.xml',
    );
    const indexXml = String(indexCall?.[2] ?? '');
    expect(indexXml).not.toContain('/sitemaps/support.xml');
    expect(indexXml).toContain('/sitemaps/static.xml');
    expect(indexXml).toContain('/sitemaps/brands.xml');
  });

  it('forces full regenerate when live index host differs from configured base URL', async () => {
    storageService.readLiveText.mockResolvedValue(
      '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://cureka.techbv.in/sitemaps/static.xml</loc></sitemap></sitemapindex>',
    );

    await generator.generateGroup('static');

    expect(queryService.getStaticEntries).toHaveBeenCalled();
    expect(queryService.collectBrandEntries).toHaveBeenCalled();
    expect(queryService.collectBlogEntries).toHaveBeenCalled();
    expect(storageService.publishLive).toHaveBeenCalled();
  });
});
