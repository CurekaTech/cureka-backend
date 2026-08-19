import { ConfigService } from '@nestjs/config';
import { StorageService } from '@packages/storage';
import { SitemapStorageService } from './sitemap-storage.service';

describe('SitemapStorageService.publishLive', () => {
  const storageService = {
    copy: jest.fn(),
    delete: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue('sitemaps'),
  };
  const service = new SitemapStorageService(
    storageService as unknown as StorageService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storageService.copy.mockResolvedValue(undefined);
    storageService.delete.mockResolvedValue(undefined);
  });

  it('copies children before the index, then deletes obsolete shards', async () => {
    const order: string[] = [];
    storageService.copy.mockImplementation(async (from: string, to: string) => {
      order.push(`copy:${to}`);
    });
    storageService.delete.mockImplementation(async (key: string) => {
      order.push(`delete:${key}`);
    });

    await service.publishLive({
      generationId: 'gen-1',
      childRelativePaths: ['products/products-1.xml', 'products/products-2.xml', 'products/products-3.xml'],
      indexRelativePath: 'sitemap.xml',
      obsoleteLivePaths: [],
    });

    expect(order[0]).toBe('copy:sitemaps/products/products-1.xml');
    expect(order[1]).toBe('copy:sitemaps/products/products-2.xml');
    expect(order[2]).toBe('copy:sitemaps/products/products-3.xml');
    expect(order[3]).toBe('copy:sitemaps/sitemap.xml');
  });

  it('updates the index before deleting a removed shard (3 → 2)', async () => {
    const order: string[] = [];
    storageService.copy.mockImplementation(async (_from: string, to: string) => {
      order.push(`copy:${to}`);
    });
    storageService.delete.mockImplementation(async (key: string) => {
      order.push(`delete:${key}`);
    });

    await service.publishLive({
      generationId: 'gen-2',
      childRelativePaths: ['products/products-1.xml', 'products/products-2.xml'],
      indexRelativePath: 'sitemap.xml',
      obsoleteLivePaths: ['products/products-3.xml'],
    });

    const indexAt = order.indexOf('copy:sitemaps/sitemap.xml');
    const deleteAt = order.indexOf('delete:sitemaps/products/products-3.xml');
    expect(indexAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(indexAt);
  });
});
