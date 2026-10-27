import { ConfigService } from '@nestjs/config';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductsService } from './products.service';

describe('ProductsService.approve GoKwik collections', () => {
  function createService(options?: {
    pending?: string[];
    enabled?: boolean;
    failOn?: string;
  }) {
    const pending = [...(options?.pending ?? ['c2', 'c1'])];
    const enqueued: string[] = [];
    const subtracted: string[][] = [];
    const service = Object.create(ProductsService.prototype) as ProductsService;
    Object.assign(service, {
      productsRepository: {
        findByRefId: jest.fn(async () => ({ id: 'product-id', refId: 'PRO1', status: ProductStatus.PENDING_REVIEW })),
        updateByRefId: jest.fn(async () => undefined),
        findGokwikPendingCollectionIds: jest.fn(async () => pending),
        subtractGokwikPendingCollectionIds: jest.fn(async (_refId: string, ids: string[]) => {
          subtracted.push(ids);
          for (const id of ids) {
            const index = pending.indexOf(id);
            if (index >= 0) pending.splice(index, 1);
          }
        }),
      },
      configService: {
        get: (key: string) => (key === 'gokwik.catalogSyncEnabled' ? options?.enabled !== false : undefined),
      } as ConfigService,
      gokwikQueueService: {
        enqueueCollectionSync: jest.fn(async (id: string) => {
          if (options?.failOn === id) throw new Error('redis down');
          enqueued.push(id);
        }),
      },
      eventEmitter: { emitAsync: jest.fn(async () => undefined) },
      auditService: { log: jest.fn(async () => undefined) },
      findOne: jest.fn(async () => ({ refId: 'PRO1' })),
    });
    return { service, enqueued, subtracted, pending };
  }

  it('enqueues each changed category once, in order, only from approve', async () => {
    const { service, enqueued, subtracted } = createService();
    await service.approve('PRO1', 'admin@cureka.com');
    expect(enqueued).toEqual(['c1', 'c2']);
    expect(subtracted).toEqual([['c1', 'c2']]);
  });

  it('does not enqueue when catalog sync is disabled and keeps the pending ids', async () => {
    const { service, enqueued, subtracted, pending } = createService({ enabled: false });
    await service.approve('PRO1', 'admin@cureka.com');
    expect(enqueued).toEqual([]);
    expect(subtracted).toEqual([]);
    expect(pending).toEqual(['c2', 'c1']);
  });

  it('keeps ids that were not accepted when enqueue stops halfway', async () => {
    const { service, subtracted, pending } = createService({
      pending: ['c1', 'c2'],
      failOn: 'c2',
    });
    await expect(service.approve('PRO1', 'admin@cureka.com')).rejects.toThrow('redis down');
    expect(subtracted).toEqual([['c1']]);
    expect(pending).toEqual(['c2']);
  });

  it('a second approve does not require a new category edit to finish the remaining ids', async () => {
    const harness = createService({ pending: ['c1', 'c2'], failOn: 'c2' });
    await expect(harness.service.approve('PRO1', 'admin@cureka.com')).rejects.toThrow('redis down');
    harness.enqueued.length = 0;
    harness.service['gokwikQueueService'].enqueueCollectionSync = jest.fn(async (id: string) => {
      harness.enqueued.push(id);
    });
    await harness.service.approve('PRO1', 'admin@cureka.com');
    expect(harness.enqueued).toEqual(['c2']);
    expect(harness.pending).toEqual([]);
  });
});
