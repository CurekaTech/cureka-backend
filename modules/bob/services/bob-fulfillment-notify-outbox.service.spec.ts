import { BobFulfillmentNotifyOutboxService } from './bob-fulfillment-notify-outbox.service';
import { BobNotifyOutboxRepository } from '../repositories/bob-notify-outbox.repository';
import { BobNotifyService } from './bob-notify.service';

describe('BobFulfillmentNotifyOutboxService', () => {
  let outboxRepository: jest.Mocked<
    Pick<
      BobNotifyOutboxRepository,
      | 'findByIdempotencyKey'
      | 'findAcceptedForOrderKind'
      | 'findBlockingForOrderKind'
      | 'create'
      | 'updateStatus'
      | 'updateStatusForClaim'
      | 'claimForSend'
      | 'existsByRefId'
    >
  >;
  let bobNotifyService: jest.Mocked<Pick<BobNotifyService, 'post'>>;
  let service: BobFulfillmentNotifyOutboxService;

  const payload = {
    fulfillment_id: 'ORD1',
    id: 'ORD1',
    id_alias: 'ORD1',
    lineItems: [],
    customer: {
      email: '',
      first_name: 'A',
      last_name: 'B',
      phone: '+919999999999',
      orders_count: 1,
      total_spent: 0,
      last_order_id: 'ORD1',
    },
    order_details: {
      total_price: 100,
      total_tax: 0,
      total_discount: 0,
      currency: 'INR',
    },
    tracking_info: {
      tracking_number: 'AWB1',
      tracking_url: '',
      tracking_company_name: 'X',
      shipping_status: 'shipped',
    },
    phone: '+919999999999',
    fulfilled_at: new Date().toISOString(),
  };

  beforeEach(() => {
    outboxRepository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findAcceptedForOrderKind: jest.fn().mockResolvedValue(null),
      findBlockingForOrderKind: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        attempts: 0,
        status: 'pending',
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      updateStatusForClaim: jest.fn().mockResolvedValue(true),
      claimForSend: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        attempts: 0,
        status: 'sending',
        claimToken: 'claim-1',
      }),
      existsByRefId: jest.fn().mockResolvedValue(false),
    };
    bobNotifyService = {
      post: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 200 }),
    };
    service = new BobFulfillmentNotifyOutboxService(
      outboxRepository as unknown as BobNotifyOutboxRepository,
      bobNotifyService as unknown as BobNotifyService,
    );
  });

  it('skips when already accepted', async () => {
    outboxRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'outbox-1',
      status: 'accepted',
    } as never);

    const result = await service.enqueueAndSendFulfillment({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      payload: payload as never,
    });

    expect(result.status).toBe('skipped');
    expect(bobNotifyService.post).not.toHaveBeenCalled();
  });

  it('skips when suppressed by recovery without notify', async () => {
    outboxRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'outbox-1',
      status: 'suppressed',
    } as never);

    const result = await service.enqueueAndSendFulfillment({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      payload: payload as never,
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('suppressed');
    expect(bobNotifyService.post).not.toHaveBeenCalled();
  });

  it('atomically claims then records accepted with idempotency key', async () => {
    const first = await service.enqueueAndSendFulfillment({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      payload: payload as never,
    });
    expect(first.status).toBe('accepted');
    expect(outboxRepository.claimForSend).toHaveBeenCalled();
    expect(bobNotifyService.post).toHaveBeenCalledWith(
      '/fulfillments-create',
      expect.anything(),
      expect.objectContaining({ idempotencyKey: 'fulfillments-create:ord-1' }),
    );
    expect(outboxRepository.updateStatusForClaim).toHaveBeenCalledWith(
      'outbox-1',
      expect.any(String),
      expect.objectContaining({ status: 'accepted' }),
    );
  });

  it('marks ambiguous on transport timeout so auto-retry cannot duplicate', async () => {
    bobNotifyService.post.mockResolvedValue({
      accepted: false,
      httpStatus: null,
      error: 'timeout',
    });

    const result = await service.enqueueAndSendFulfillment({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      payload: payload as never,
    });

    expect(result.status).toBe('ambiguous');
    expect(outboxRepository.updateStatusForClaim).toHaveBeenCalledWith(
      'outbox-1',
      expect.any(String),
      expect.objectContaining({ status: 'ambiguous', lastError: 'timeout' }),
    );

    outboxRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'outbox-1',
      status: 'ambiguous',
    } as never);

    const second = await service.enqueueAndSendFulfillment({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      payload: payload as never,
    });
    expect(second.status).toBe('skipped');
    expect(second.reason).toBe('ambiguous_prior_send_requires_manual_reconcile');
  });

  it('writes durable suppression for recovery --apply without --notify', async () => {
    const result = await service.suppressFulfillmentNotify({
      orderId: 'ord-1',
      orderNumber: 'ORD1',
      shipmentId: 'ship-1',
      reason: 'recovery_apply_without_notify',
    });
    expect(result.status).toBe('suppressed');
    expect(outboxRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'suppressed',
        idempotencyKey: 'fulfillments-create:ord-1',
        lastError: 'recovery_apply_without_notify',
      }),
    );
  });

  it('treats suppressed as blocking for later webhooks', async () => {
    outboxRepository.findBlockingForOrderKind.mockResolvedValue({
      id: 'outbox-1',
      status: 'suppressed',
    } as never);
    expect(await service.hasBlockingFulfillment('ord-1')).toBe(true);
  });
});
