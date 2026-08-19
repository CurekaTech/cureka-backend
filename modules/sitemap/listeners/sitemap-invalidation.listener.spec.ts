import { ConfigService } from '@nestjs/config';
import { ProductUpdatedEvent, CategoryUpdatedEvent, BrandUpdatedEvent } from '@packages/events';
import { SitemapInvalidationListener } from '../listeners/sitemap-invalidation.listener';
import { SitemapQueueService } from '../services/sitemap-queue.service';

describe('SitemapInvalidationListener', () => {
  const queueService = {
    enqueueGroup: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue(true),
  };
  const listener = new SitemapInvalidationListener(
    queueService as unknown as SitemapQueueService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockReturnValue(true);
    delete process.env['BYPASS_PRODUCT_SIDE_EFFECT_LISTENERS'];
  });

  it('marks products dirty on product create/update/delete', async () => {
    await listener.onProductUpdated(new ProductUpdatedEvent('PRD1', 'created'));
    await listener.onProductUpdated(new ProductUpdatedEvent('PRD1', 'updated'));
    await listener.onProductUpdated(new ProductUpdatedEvent('PRD1', 'deleted'));
    expect(queueService.enqueueGroup).toHaveBeenCalledTimes(3);
    expect(queueService.enqueueGroup).toHaveBeenCalledWith('products');
  });

  it('dirties categories and products when a category changes', async () => {
    await listener.onCategoryUpdated(new CategoryUpdatedEvent('CAT1', 'updated'));
    expect(queueService.enqueueGroup).toHaveBeenCalledWith('categories');
    expect(queueService.enqueueGroup).toHaveBeenCalledWith('products');
  });

  it('dirties only brands when a brand changes', async () => {
    await listener.onBrandUpdated(new BrandUpdatedEvent('BRD1', 'updated'));
    expect(queueService.enqueueGroup).toHaveBeenCalledWith('brands');
    expect(queueService.enqueueGroup).not.toHaveBeenCalledWith('products');
  });

  it('skips product invalidation during bulk-upload bypass', async () => {
    process.env['BYPASS_PRODUCT_SIDE_EFFECT_LISTENERS'] = 'true';
    await listener.onProductUpdated(new ProductUpdatedEvent('PRD1', 'updated'));
    expect(queueService.enqueueGroup).not.toHaveBeenCalled();
  });
});
