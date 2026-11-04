import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GokwikCartOwnerGuard } from './gokwik-cart-owner.guard';

describe('GokwikCartOwnerGuard', () => {
  const cartService = {
    findCartById: jest.fn(),
  };
  const guard = new GokwikCartOwnerGuard(cartService as never);

  const makeContext = (request: Record<string, unknown>) => ({
    switchToHttp: () => ({ getRequest: () => request }),
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to the checkout-token cart when GoKwik sends a non-Cureka cart id', async () => {
    const boundCart = { id: '11111111-1111-1111-1111-111111111111', userId: 'user-1' };
    cartService.findCartById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(boundCart);

    const request: {
      user: { sub: string };
      body: { cart_id: string };
      gokwikCheckoutCartId: string;
      gokwikResolvedCartId?: string;
    } = {
      user: { sub: 'user-1' },
      body: { cart_id: '6aeac09aabb7d49828e240ed' },
      gokwikCheckoutCartId: boundCart.id,
    };

    await expect(guard.canActivate(makeContext(request) as never)).resolves.toBe(true);
    expect(request.body.cart_id).toBe(boundCart.id);
    expect(request.gokwikResolvedCartId).toBe(boundCart.id);
  });

  it('reads cart_id from query for GET callbacks', async () => {
    const cart = { id: '11111111-1111-1111-1111-111111111111', userId: 'user-1' };
    cartService.findCartById.mockResolvedValue(cart);

    const request: {
      user: { sub: string };
      query: { cart_id: string };
      gokwikCheckoutCartId: string;
      gokwikResolvedCartId?: string;
    } = {
      user: { sub: 'user-1' },
      query: { cart_id: cart.id },
      gokwikCheckoutCartId: cart.id,
    };

    await expect(guard.canActivate(makeContext(request) as never)).resolves.toBe(true);
    expect(request.gokwikResolvedCartId).toBe(cart.id);
  });

  it('rejects a token bound to a different Cureka cart', async () => {
    cartService.findCartById.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      userId: 'user-1',
    });

    const request = {
      user: { sub: 'user-1' },
      body: { cart_id: '11111111-1111-1111-1111-111111111111' },
      gokwikCheckoutCartId: '22222222-2222-2222-2222-222222222222',
    };

    await expect(guard.canActivate(makeContext(request) as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects an unknown cart id without a bound checkout cart', async () => {
    cartService.findCartById.mockResolvedValue(null);
    const request = {
      user: { sub: 'user-1' },
      body: { cart_id: '6aeac09aabb7d49828e240ed' },
    };

    await expect(guard.canActivate(makeContext(request) as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
