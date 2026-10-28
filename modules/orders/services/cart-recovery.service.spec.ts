import { BadRequestException } from '@nestjs/common';
import { CartRecoveryService } from './cart-recovery.service';

describe('CartRecoveryService', () => {
  const snapshots = {
    create: jest.fn(),
    findByToken: jest.fn(),
    markRestored: jest.fn(),
  };
  const cartService = {
    addItem: jest.fn(),
    getCart: jest.fn(),
  };
  const service = new CartRecoveryService(snapshots as never, cartService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a storefront recover URL from the token', () => {
    expect(service.recoverUrl('https://www.cureka.com/', 'tok123')).toBe(
      'https://www.cureka.com/cart/recover?token=tok123',
    );
  });

  it('rejects expired or missing tokens', async () => {
    snapshots.findByToken.mockResolvedValue(null);
    await expect(service.recoverForUser('user-1', 'missing')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    snapshots.findByToken.mockResolvedValue({
      id: 's1',
      expiresAt: new Date(Date.now() - 1000),
      items: [],
    });
    await expect(service.recoverForUser('user-1', 'old')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('restores in-stock items and skips unavailable ones', async () => {
    snapshots.findByToken.mockResolvedValue({
      id: 's1',
      expiresAt: new Date(Date.now() + 60_000),
      items: [
        { productId: 'p1', variantId: 'v1', quantity: 1, productName: 'A', sku: 'A' },
        { productId: 'p2', variantId: 'v2', quantity: 1, productName: 'B', sku: 'B' },
      ],
    });
    cartService.addItem
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new BadRequestException('Out of stock'));
    cartService.getCart.mockResolvedValue({ cartId: 'c1', items: [] });

    const result = await service.recoverForUser('user-1', 'tok');

    expect(result.addedItems).toBe(1);
    expect(result.skippedItems).toHaveLength(1);
    expect(snapshots.markRestored).toHaveBeenCalledWith('s1');
  });
});
