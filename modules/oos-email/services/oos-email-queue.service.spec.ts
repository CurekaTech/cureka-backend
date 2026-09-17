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
});
