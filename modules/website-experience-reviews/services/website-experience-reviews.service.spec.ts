import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WebsiteExperienceReviewsService } from './website-experience-reviews.service';

jest.mock('@packages/common', () => {
  const actual = jest.requireActual('@packages/common');
  return {
    ...actual,
    generateUniqueRefId: jest.fn(async () => 'WER2026000001'),
  };
});

describe('WebsiteExperienceReviewsService', () => {
  const reviewsRepository = {
    findByOrderId: jest.fn(),
    create: jest.fn(),
    existsByRefId: jest.fn(),
    findAllPaginated: jest.fn(),
  };
  const ordersRepository = {
    findByIdAndUserId: jest.fn(),
    findByOrderNumberAndUserId: jest.fn(),
  };

  const service = new WebsiteExperienceReviewsService(
    reviewsRepository as never,
    ordersRepository as never,
  );

  const user = {
    sub: 'user-1',
    isRegistered: true,
    profile: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not let guests review', async () => {
    await expect(service.eligibility('order-1', { isRegistered: false, sub: 'g' } as never)).resolves.toEqual({
      canReview: false,
      submitted: false,
      existingReview: null,
    });
  });

  it('returns canReview when the customer owns the order and has not submitted', async () => {
    ordersRepository.findByIdAndUserId.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      orderNumber: 'CK1001',
    });
    reviewsRepository.findByOrderId.mockResolvedValue(null);

    await expect(
      service.eligibility('11111111-1111-4111-8111-111111111111', user as never),
    ).resolves.toEqual({
      canReview: true,
      submitted: false,
      existingReview: null,
    });
  });

  it('rejects a second review for the same order', async () => {
    ordersRepository.findByOrderNumberAndUserId.mockResolvedValue({
      id: 'order-1',
      orderNumber: 'CK1001',
    });
    reviewsRepository.findByOrderId.mockResolvedValue({ id: 'existing' });

    await expect(
      service.createForOrder('CK1001', { rating: 5 }, user as never),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(reviewsRepository.create).not.toHaveBeenCalled();
  });

  it('requires a signed-in customer to submit', async () => {
    await expect(
      service.createForOrder('CK1001', { rating: 5 }, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the order is not owned by the customer', async () => {
    ordersRepository.findByOrderNumberAndUserId.mockResolvedValue(null);
    await expect(
      service.createForOrder('CK1001', { rating: 4, feedback: 'Smooth checkout' }, user as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
