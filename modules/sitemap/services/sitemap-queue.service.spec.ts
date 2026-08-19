import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { SitemapDirtyService } from './sitemap-dirty.service';
import { SitemapQueueService } from './sitemap-queue.service';

describe('SitemapQueueService', () => {
  const queue = {
    getJob: jest.fn(),
    add: jest.fn(),
  };
  const dirtyService = {
    markDirty: jest.fn(),
    isDirty: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'sitemap.enabled') return true;
      if (key === 'sitemap.debounceMs') return 60_000;
      return undefined;
    }),
  };

  const service = new SitemapQueueService(
    queue as unknown as Queue,
    dirtyService as unknown as SitemapDirtyService,
    configService as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'sitemap.enabled') return true;
      if (key === 'sitemap.debounceMs') return 60_000;
      return undefined;
    });
    queue.add.mockResolvedValue({});
    dirtyService.markDirty.mockResolvedValue(undefined);
  });

  it('replaces a delayed job so rapid updates debounce', async () => {
    const existing = {
      getState: jest.fn().mockResolvedValue('delayed'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    queue.getJob.mockResolvedValue(existing);

    await service.enqueueGroup('products');

    expect(dirtyService.markDirty).toHaveBeenCalledWith('products');
    expect(existing.remove).toHaveBeenCalled();
    expect(queue.add).toHaveBeenCalledWith(
      'generate-group',
      { group: 'products' },
      expect.objectContaining({ jobId: 'sitemap-generate-products', delay: 60_000 }),
    );
  });

  it('skips enqueue when a job is already active', async () => {
    const existing = {
      getState: jest.fn().mockResolvedValue('active'),
      remove: jest.fn(),
    };
    queue.getJob.mockResolvedValue(existing);

    await service.enqueueGroup('products');

    expect(dirtyService.markDirty).toHaveBeenCalledWith('products');
    expect(existing.remove).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-enqueues after an active job if the group is still dirty', async () => {
    queue.getJob.mockResolvedValue(null);
    dirtyService.isDirty.mockResolvedValue(true);

    await service.enqueueAfterActiveIfDirty('products');

    expect(queue.add).toHaveBeenCalled();
  });
});
