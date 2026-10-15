import { AdminNotificationEmailType } from '@modules/admin-settings/enums/admin-notification-email-type.enum';
import { OosEmailQueueService } from './oos-email-queue.service';

describe('OosEmailQueueService', () => {
  const queue = { add: jest.fn() };
  const mailService = { isConfigured: jest.fn() };
  const notificationEmailsService = { countActiveByType: jest.fn() };

  const service = new OosEmailQueueService(
    queue as never,
    mailService as never,
    notificationEmailsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips enqueue when SMTP is unset', async () => {
    mailService.isConfigured.mockReturnValue(false);
    await service.enqueueTransitions([
      {
        variantId: 'v1',
        productId: 'p1',
        sku: 'SKU1',
        stock: 0,
        occurredAt: new Date(),
      },
    ]);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips enqueue when no active recipients', async () => {
    mailService.isConfigured.mockReturnValue(true);
    notificationEmailsService.countActiveByType.mockResolvedValue(0);
    await service.enqueueTransitions([
      {
        variantId: 'v1',
        productId: 'p1',
        sku: 'SKU1',
        stock: 0,
        occurredAt: new Date(),
      },
    ]);
    expect(notificationEmailsService.countActiveByType).toHaveBeenCalledWith(
      AdminNotificationEmailType.PRODUCT_OOS,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues one job per transition when configured', async () => {
    mailService.isConfigured.mockReturnValue(true);
    notificationEmailsService.countActiveByType.mockResolvedValue(2);
    queue.add.mockResolvedValue({ id: 'job-1' });
    const occurredAt = new Date('2026-09-17T12:00:00.000Z');

    await service.enqueueTransitions([
      {
        variantId: 'v1',
        productId: 'p1',
        sku: 'SKU1',
        stock: 0,
        productName: 'Test',
        occurredAt,
      },
    ]);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][0]).toBe('send-product-oos');
    expect(queue.add.mock.calls[0][1]).toMatchObject({
      variantId: 'v1',
      sku: 'SKU1',
      stock: 0,
      occurredAt: occurredAt.toISOString(),
    });
  });

  it('enqueues one bundle email that includes every OOS component', async () => {
    mailService.isConfigured.mockReturnValue(true);
    notificationEmailsService.countActiveByType.mockResolvedValue(1);
    queue.add.mockResolvedValue({ id: 'job-2' });

    await service.enqueueBundleNotifications([
      {
        bundleRefId: 'BNDA',
        bundleName: 'Immunity Care Bundle',
        bundleSku: 'BND-12345',
        reason: 'component oos',
        occurredAt: '2026-09-28T00:00:00.000Z',
        components: [
          {
            refId: 'VITC',
            name: 'Vitamin C 500mg',
            variants: [{ sku: 'VIT-C-001', name: 'Vitamin C 500mg' }],
          },
          {
            refId: 'ZINC',
            name: 'Zinc Tablets',
            variants: [{ sku: 'ZIN-002', name: 'Zinc Tablets' }],
          },
        ],
      },
    ]);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add.mock.calls[0][0]).toBe('send-bundle-oos');
    expect(queue.add.mock.calls[0][1].components).toHaveLength(2);
    expect(queue.add.mock.calls[0][2].jobId).toMatch(/^bundle-oos-BNDA-[a-f0-9]+-\d+$/);
  });

  it('enqueues again when the same bundle component set goes OOS later', async () => {
    mailService.isConfigured.mockReturnValue(true);
    notificationEmailsService.countActiveByType.mockResolvedValue(1);
    queue.add.mockResolvedValue({ id: 'job-3' });
    const notification = {
      bundleRefId: 'BNDA',
      bundleName: 'Immunity Care Bundle',
      bundleSku: 'BND-12345',
      reason: 'component oos',
      occurredAt: '2026-09-28T00:00:00.000Z',
      components: [
        {
          refId: 'VITC',
          name: 'Vitamin C 500mg',
          variants: [{ sku: 'VIT-C-001', name: 'Vitamin C 500mg' }],
        },
      ],
    };

    await service.enqueueBundleNotifications([notification]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.enqueueBundleNotifications([notification]);

    expect(queue.add).toHaveBeenCalledTimes(2);
    const firstJobId = queue.add.mock.calls[0][2].jobId as string;
    const secondJobId = queue.add.mock.calls[1][2].jobId as string;
    expect(firstJobId).not.toBe(secondJobId);
  });
});
