import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import { SessionCacheService } from './session-cache.service';
import {
  GOKWIK_CHECKOUT_DEVICE_PREFIX,
  SESSION_PURPOSE_GOKWIK_CHECKOUT,
  SESSION_PURPOSE_LOGIN,
} from '../constants/session-purpose.constants';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { GokwikCheckoutTokenService } from './gokwik-checkout-token.service';

describe('GokwikCheckoutTokenService (opaque)', () => {
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'gokwik.checkoutTokenTtlSeconds') return 2700;
      return undefined;
    }),
  };
  const userSessionsRepository = {
    create: jest.fn(),
    findActiveSessionWithUserByTokenHash: jest.fn(),
    revokeById: jest.fn(),
  };
  const sessionCacheService = {
    setContext: jest.fn(),
    invalidateBySessionId: jest.fn(),
  };

  const service = new GokwikCheckoutTokenService(
    configService as unknown as ConfigService,
    userSessionsRepository as unknown as UserSessionsRepository,
    sessionCacheService as unknown as SessionCacheService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues an opaque token stored with gokwik_checkout purpose', async () => {
    userSessionsRepository.create.mockResolvedValue({ id: 'sess-1' });

    const token = await service.issue({ userId: 'user-1', cartId: 'cart-uuid-1' });

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(userSessionsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
        deviceId: `${GOKWIK_CHECKOUT_DEVICE_PREFIX}cart-uuid-1`,
        deviceName: 'GoKwik checkout',
        isRevoked: false,
      }),
    );
  });

  it('resolves a valid gokwik_checkout token', async () => {
    userSessionsRepository.findActiveSessionWithUserByTokenHash.mockResolvedValue({
      id: 'sess-1',
      purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
      deviceId: `${GOKWIK_CHECKOUT_DEVICE_PREFIX}cart-1`,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        role: UserRole.CUSTOMER,
        isGuest: false,
        isRegistered: true,
        status: UserStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const resolved = await service.resolveToSessionContext('a'.repeat(64));

    expect(resolved.cartId).toBe('cart-1');
    expect(resolved.context.purpose).toBe(SESSION_PURPOSE_GOKWIK_CHECKOUT);
    expect(resolved.context.sub).toBe('user-1');
  });

  it('rejects login-purpose sessions', async () => {
    userSessionsRepository.findActiveSessionWithUserByTokenHash.mockResolvedValue({
      id: 'sess-1',
      purpose: SESSION_PURPOSE_LOGIN,
      deviceId: 'browser-1',
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1' },
    });

    await expect(service.resolveToSessionContext('a'.repeat(64))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects expired tokens', async () => {
    userSessionsRepository.findActiveSessionWithUserByTokenHash.mockResolvedValue({
      id: 'sess-1',
      purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
      deviceId: `${GOKWIK_CHECKOUT_DEVICE_PREFIX}cart-1`,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'user-1' },
    });

    await expect(service.resolveToSessionContext('a'.repeat(64))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(userSessionsRepository.revokeById).toHaveBeenCalledWith('sess-1');
  });
});
