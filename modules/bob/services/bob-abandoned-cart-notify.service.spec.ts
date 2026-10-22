import { NotFoundException } from '@nestjs/common';
import { BobAbandonedCartNotifyService } from './bob-abandoned-cart-notify.service';

const inactivityMs = 30 * 60_000;
const cooldownMs = 24 * 60 * 60_000;

describe('BobAbandonedCartNotifyService', () => {
  let configService: { get: jest.Mock };
  let redis: { getConnectedClient: jest.Mock };
  let cartsRepository: {
    findAbandonedCartNotifyCandidates: jest.Mock;
    findActiveById: jest.Mock;
  };
  let usersService: { findById: jest.Mock };
  let abandonedCartsService: { findOne: jest.Mock };
  let outboxRepository: {
    existsByRefId: jest.Mock;
    create: jest.Mock;
    findById: jest.Mock;
    claimForSend: jest.Mock;
    updateStatusForClaim: jest.Mock;
    updateStatus: jest.Mock;
    findBlockingByUserIds: jest.Mock;
    findBlockingByPhones: jest.Mock;
    findCooldownAnchor: jest.Mock;
  };
  let queueService: { enqueueSend: jest.Mock };
  let bobNotifyService: { post: jest.Mock };
  let service: BobAbandonedCartNotifyService;

  const candidate = {
    cartId: 'cart-1',
    cartRefId: 'CAR20260001',
    userId: 'user-1',
    mobileNumber: '9876543210',
    lastActivityAt: new Date(Date.now() - inactivityMs - 60_000),
    itemCount: 1,
  };

  const payload = {
    checkout_id: 'CAR20260001',
    cart_recovery_url: 'https://www.cureka.com/cart',
    line_items: [{ id: 'slug', name: 'Item', image: { originalSrc: '' }, quantity: 1, price: 100 }],
    customer: {
      email: 'a@test.com',
      first_name: 'A',
      last_name: 'B',
      phone: '+919876543210',
    },
    order_details: { total_price: 100, total_tax: 0, total_discount: 0, currency: 'INR' },
    address: {
      billing_address: { address: '', city: '', province: '', country: 'India', zip: '' },
      shipping_address: { address: '', city: '', province: '', country: 'India', zip: '' },
    },
    phone: '+919876543210',
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'bob.abandonedCart') {
          return {
            enabled: true,
            scanIntervalMinutes: 30,
            inactivityMinutes: 30,
            cooldownHours: 24,
            batchSize: 50,
            maxBatchesPerScan: 2,
            maxAttempts: 3,
          };
        }
        if (key === 'bob.notifyUrl') return 'https://customstore.bonb.io/curekanew';
        if (key === 'bob.guestId') return 'guest-key';
        if (key === 'STOREFRONT_URL') return 'https://www.cureka.com';
        return undefined;
      }),
    };
    redis = { getConnectedClient: jest.fn().mockResolvedValue(null) };
    cartsRepository = {
      findAbandonedCartNotifyCandidates: jest.fn().mockResolvedValue([]),
      findActiveById: jest.fn(),
    };
    usersService = {
      findById: jest.fn().mockResolvedValue({
        id: 'user-1',
        isGuest: false,
        mobileNumber: '9876543210',
      }),
    };
    abandonedCartsService = {
      findOne: jest.fn().mockResolvedValue({
        id: 'cart-1',
        refId: 'CAR20260001',
        lastActivityAt: candidate.lastActivityAt,
        createdAt: candidate.lastActivityAt,
        updatedAt: candidate.lastActivityAt,
        customer: {
          email: 'a@test.com',
          firstName: 'A',
          lastName: 'B',
          mobileNumber: '9876543210',
          isGuest: false,
        },
        addresses: [],
        defaultAddress: null,
        cart: {
          items: [{ productSlug: 'slug', productName: 'Item', quantity: 1, unitPrice: 100 }],
          grandTotal: 100,
          discountAmount: 0,
        },
      }),
    };
    outboxRepository = {
      existsByRefId: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({
        id: 'outbox-1',
        attempts: 0,
        status: 'pending',
        idempotencyKey: 'abandoned-cart:user-1:cart-1:1',
      }),
      findById: jest.fn(),
      claimForSend: jest.fn(),
      updateStatusForClaim: jest.fn().mockResolvedValue(true),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findBlockingByUserIds: jest.fn().mockResolvedValue([]),
      findBlockingByPhones: jest.fn().mockResolvedValue([]),
      findCooldownAnchor: jest.fn().mockResolvedValue(null),
    };
    queueService = { enqueueSend: jest.fn().mockResolvedValue(true) };
    bobNotifyService = {
      post: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 200 }),
    };

    service = new BobAbandonedCartNotifyService(
      configService as never,
      redis as never,
      cartsRepository as never,
      usersService as never,
      abandonedCartsService as never,
      outboxRepository as never,
      queueService as never,
      bobNotifyService as never,
    );
  });

  it('queues a registered nonempty cart that has been idle for more than 30 minutes', async () => {
    cartsRepository.findAbandonedCartNotifyCandidates
      .mockResolvedValueOnce([candidate])
      .mockResolvedValue([]);

    const summary = await service.scanAndEnqueue();

    expect(summary.scanned).toBe(1);
    expect(summary.eligible).toBe(1);
    expect(summary.queued).toBe(1);
    expect(outboxRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        cartId: 'cart-1',
        destinationPhoneNormalized: '9876543210',
        status: 'pending',
      }),
    );
    expect(queueService.enqueueSend).toHaveBeenCalledWith(
      expect.objectContaining({ outboxId: 'outbox-1', userId: 'user-1' }),
    );
    expect(bobNotifyService.post).not.toHaveBeenCalled();
  });

  it('skips carts already reserved or notified within the rolling 24h window', async () => {
    cartsRepository.findAbandonedCartNotifyCandidates
      .mockResolvedValueOnce([candidate])
      .mockResolvedValue([]);
    outboxRepository.findBlockingByUserIds.mockResolvedValue([
      {
        id: 'outbox-old',
        userId: 'user-1',
        destinationPhoneNormalized: '9876543210',
        status: 'accepted',
        acceptedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    const summary = await service.scanAndEnqueue();
    expect(summary.queued).toBe(0);
    expect(summary.skippedReasons['cooldown_24h']).toBe(1);
    expect(outboxRepository.create).not.toHaveBeenCalled();
  });

  it('keeps scanning later candidates after an earlier row is reserved in the same batch', async () => {
    const second = {
      ...candidate,
      cartId: 'cart-2',
      cartRefId: 'CAR20260002',
      userId: 'user-2',
      mobileNumber: '9123456789',
    };
    cartsRepository.findAbandonedCartNotifyCandidates
      .mockResolvedValueOnce([candidate, second])
      .mockResolvedValue([]);

    const summary = await service.scanAndEnqueue();
    expect(summary.queued).toBe(2);
    expect(queueService.enqueueSend).toHaveBeenCalledTimes(2);
  });

  it('does not send when two workers race — only the claim winner posts to BOB', async () => {
    outboxRepository.findById.mockResolvedValue({
      id: 'outbox-1',
      status: 'pending',
      attempts: 0,
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
      destinationPhoneNormalized: '9876543210',
      idempotencyKey: 'key-1',
    });
    outboxRepository.claimForSend
      .mockResolvedValueOnce({
        id: 'outbox-1',
        status: 'sending',
        attempts: 0,
        userId: 'user-1',
        cartId: 'cart-1',
        cartRefId: 'CAR20260001',
        destinationPhoneNormalized: '9876543210',
        idempotencyKey: 'key-1',
        claimToken: 'claim-1',
      })
      .mockResolvedValueOnce(null);

    cartsRepository.findActiveById.mockResolvedValue({
      id: 'cart-1',
      isActive: true,
      lastCustomerActivityAt: candidate.lastActivityAt,
      updatedAt: candidate.lastActivityAt,
      createdAt: candidate.lastActivityAt,
      items: [{ quantity: 1, updatedAt: candidate.lastActivityAt }],
    });

    const first = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    const second = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('skipped');
    expect(bobNotifyService.post).toHaveBeenCalledTimes(1);
    expect(bobNotifyService.post).toHaveBeenCalledWith(
      '/abancart',
      expect.objectContaining({ checkout_id: 'CAR20260001' }),
      expect.objectContaining({ idempotencyKey: 'key-1' }),
    );
    expect(outboxRepository.updateStatusForClaim).toHaveBeenCalledWith(
      'outbox-1',
      expect.any(String),
      expect.objectContaining({ status: 'accepted', acceptedAt: expect.any(Date) }),
    );
  });

  it('skips send when the cart changed, emptied, or was purchased after enqueue', async () => {
    outboxRepository.findById.mockResolvedValue({
      id: 'outbox-1',
      status: 'pending',
      attempts: 0,
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
      destinationPhoneNormalized: '9876543210',
      idempotencyKey: 'key-1',
    });
    outboxRepository.claimForSend.mockResolvedValue({
      id: 'outbox-1',
      status: 'sending',
      attempts: 0,
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
      destinationPhoneNormalized: '9876543210',
      idempotencyKey: 'key-1',
      claimToken: 'claim-1',
    });
    cartsRepository.findActiveById.mockResolvedValue({
      id: 'cart-1',
      isActive: true,
      lastCustomerActivityAt: new Date(),
      updatedAt: new Date(),
      createdAt: candidate.lastActivityAt,
      items: [{ quantity: 1, updatedAt: new Date() }],
    });

    const recent = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(recent.status).toBe('skipped');
    expect(recent.reason).toBe('recent_activity');

    cartsRepository.findActiveById.mockResolvedValue({
      id: 'cart-1',
      isActive: true,
      lastCustomerActivityAt: candidate.lastActivityAt,
      updatedAt: candidate.lastActivityAt,
      createdAt: candidate.lastActivityAt,
      items: [],
    });
    const empty = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(empty.reason).toBe('purchased_or_emptied');

    cartsRepository.findActiveById.mockResolvedValue({
      id: 'cart-1',
      isActive: true,
      lastCustomerActivityAt: candidate.lastActivityAt,
      updatedAt: candidate.lastActivityAt,
      createdAt: candidate.lastActivityAt,
      items: [{ quantity: 1, updatedAt: candidate.lastActivityAt }],
    });
    abandonedCartsService.findOne.mockRejectedValue(new NotFoundException('Abandoned cart not found'));
    const purchased = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(purchased.reason).toBe('purchased_or_emptied');
    expect(bobNotifyService.post).not.toHaveBeenCalled();
  });

  it('records accepted_at so restart/suppression history survives process death', async () => {
    outboxRepository.findById.mockResolvedValue({
      id: 'outbox-1',
      status: 'accepted',
      acceptedAt: new Date('2026-09-10T10:00:00.000Z'),
    });

    const result = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('already_accepted');
    expect(bobNotifyService.post).not.toHaveBeenCalled();
  });

  it('marks timeouts ambiguous and 5xx failed/retry without duplicate-blind retry', async () => {
    const sending = {
      id: 'outbox-1',
      status: 'sending',
      attempts: 0,
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
      destinationPhoneNormalized: '9876543210',
      idempotencyKey: 'key-1',
      claimToken: 'claim-1',
    };
    outboxRepository.findById.mockResolvedValue({ ...sending, status: 'pending' });
    outboxRepository.claimForSend.mockResolvedValue(sending);
    cartsRepository.findActiveById.mockResolvedValue({
      id: 'cart-1',
      isActive: true,
      lastCustomerActivityAt: candidate.lastActivityAt,
      updatedAt: candidate.lastActivityAt,
      createdAt: candidate.lastActivityAt,
      items: [{ quantity: 1, updatedAt: candidate.lastActivityAt }],
    });

    bobNotifyService.post.mockResolvedValueOnce({
      accepted: false,
      httpStatus: null,
      error: 'timeout',
    });
    const uncertain = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(uncertain.status).toBe('ambiguous');
    expect(outboxRepository.updateStatusForClaim).toHaveBeenCalledWith(
      'outbox-1',
      expect.any(String),
      expect.objectContaining({ status: 'ambiguous' }),
    );

    bobNotifyService.post.mockResolvedValueOnce({
      accepted: false,
      httpStatus: 503,
      error: 'unavailable',
    });
    const retry = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(retry.status).toBe('retry');

    bobNotifyService.post.mockResolvedValueOnce({
      accepted: false,
      httpStatus: 401,
      error: 'unauthorized',
    });
    const permanent = await service.processSend({
      outboxId: 'outbox-1',
      userId: 'user-1',
      cartId: 'cart-1',
      cartRefId: 'CAR20260001',
    });
    expect(permanent.status).toBe('failed');
  });

  it('uses a rolling cooldown, not a calendar-date key', () => {
    expect(service.settings().cooldownMs).toBe(cooldownMs);
  });
});
