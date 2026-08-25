import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { GokwikCheckoutAuthGuard } from './gokwik-checkout-auth.guard';
import { GokwikCheckoutTokenService } from '@modules/auth/services/gokwik-checkout-token.service';

describe('GokwikCheckoutAuthGuard', () => {
  const gokwikCheckoutTokenService = {
    resolveToSessionContext: jest.fn(),
  };

  const guard = new GokwikCheckoutAuthGuard(
    gokwikCheckoutTokenService as unknown as GokwikCheckoutTokenService,
  );

  const makeContext = (authorization?: string) => {
    const request: Record<string, unknown> = {
      headers: authorization ? { authorization } : {},
      cookies: {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      request,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates an opaque gokwik_checkout bearer', async () => {
    const ctx = makeContext(`Bearer ${'a'.repeat(64)}`);
    gokwikCheckoutTokenService.resolveToSessionContext.mockResolvedValue({
      context: {
        sub: 'user-1',
        sessionId: 'sess-gokwik',
        role: UserRole.CUSTOMER,
        isGuest: false,
        isRegistered: true,
        status: UserStatus.ACTIVE,
        profile: {},
        purpose: 'gokwik_checkout',
      },
      cartId: 'cart-1',
      jti: 'sess-gokwik',
    });

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(ctx.request.gokwikCheckoutCartId).toBe('cart-1');
  });

  it('rejects login / non-gokwik tokens', async () => {
    const ctx = makeContext(`Bearer ${'b'.repeat(64)}`);
    gokwikCheckoutTokenService.resolveToSessionContext.mockRejectedValue(
      new UnauthorizedException('Not a GoKwik checkout token'),
    );

    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing bearer/cookie', async () => {
    const ctx = makeContext();
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
