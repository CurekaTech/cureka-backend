import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mapUserEntityToResponse } from '@modules/users/mappers/user.mapper';
import {
  GOKWIK_CHECKOUT_DEVICE_NAME,
  GOKWIK_CHECKOUT_DEVICE_PREFIX,
  parseGokwikCheckoutCartId,
  SESSION_PURPOSE_GOKWIK_CHECKOUT,
  SESSION_PURPOSE_LOGIN,
} from '../constants/session-purpose.constants';
import { IUserSessionContext } from '../interfaces/session.interface';
import { UserSessionsRepository } from '../repositories/user-sessions.repository';
import { generateRefreshToken, hashRefreshToken } from '../utils/refresh-token.util';
import { SessionCacheService } from './session-cache.service';

/** Default TTL for GoKwik customerToken: 45 minutes. */
export const GOKWIK_CHECKOUT_TOKEN_DEFAULT_TTL_SECONDS = 45 * 60;

export interface IIssueGokwikCheckoutTokenInput {
  userId: string;
  cartId: string;
}

/**
 * Issues short-lived, checkout-scoped **opaque** tokens for the GoKwik SDK (`customerToken`).
 *
 * Lives in AuthModule (global) to avoid PaymentRequests ↔ Gokwik circular imports.
 * Stored in `user_sessions` with `purpose = gokwik_checkout`; SessionCookieGuard rejects
 * these on normal storefront APIs.
 */
@Injectable()
export class GokwikCheckoutTokenService {
  constructor(
    private readonly configService: ConfigService,
    private readonly userSessionsRepository: UserSessionsRepository,
    private readonly sessionCacheService: SessionCacheService,
  ) {}

  async issue(input: IIssueGokwikCheckoutTokenInput): Promise<string> {
    const sessionToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(sessionToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.getTtlSeconds() * 1000);
    const deviceId = `${GOKWIK_CHECKOUT_DEVICE_PREFIX}${input.cartId}`.slice(0, 64);

    await this.userSessionsRepository.create({
      userId: input.userId,
      refreshTokenHash,
      deviceId,
      deviceName: GOKWIK_CHECKOUT_DEVICE_NAME,
      lastActivity: now,
      expiresAt,
      isRevoked: false,
      purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
    });

    return sessionToken;
  }

  async resolveToSessionContext(token: string): Promise<{
    context: IUserSessionContext;
    cartId: string;
    jti: string;
  }> {
    const refreshTokenHash = hashRefreshToken(token);
    const session =
      await this.userSessionsRepository.findActiveSessionWithUserByTokenHash(refreshTokenHash);

    if (!session) {
      throw new UnauthorizedException('Invalid or revoked GoKwik checkout token');
    }

    if (session.expiresAt <= new Date()) {
      await this.userSessionsRepository.revokeById(session.id);
      await this.sessionCacheService.invalidateBySessionId(session.id);
      throw new UnauthorizedException('GoKwik checkout token expired');
    }

    const purpose = session.purpose?.trim() || SESSION_PURPOSE_LOGIN;
    if (purpose !== SESSION_PURPOSE_GOKWIK_CHECKOUT) {
      throw new UnauthorizedException('Not a GoKwik checkout token');
    }

    if (!session.user) {
      throw new UnauthorizedException('User not found for GoKwik checkout token');
    }

    const cartId = parseGokwikCheckoutCartId(session.deviceId);
    if (!cartId) {
      throw new UnauthorizedException('GoKwik checkout token is missing cart binding');
    }

    const profile = mapUserEntityToResponse(session.user);
    const context: IUserSessionContext = {
      sub: profile.id,
      sessionId: session.id,
      role: profile.role,
      isGuest: profile.isGuest,
      isRegistered: profile.isRegistered,
      status: profile.status,
      profile,
      purpose: SESSION_PURPOSE_GOKWIK_CHECKOUT,
      gokwikCartId: cartId,
    };

    await this.sessionCacheService.setContext(refreshTokenHash, session.id, context);

    return { context, cartId, jti: session.id };
  }

  async revoke(sessionId: string): Promise<void> {
    if (!sessionId?.trim()) return;
    await this.sessionCacheService.invalidateBySessionId(sessionId);
    await this.userSessionsRepository.revokeById(sessionId);
  }

  private getTtlSeconds(): number {
    const configured = this.configService.get<number>('gokwik.checkoutTokenTtlSeconds');
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured);
    }
    return GOKWIK_CHECKOUT_TOKEN_DEFAULT_TTL_SECONDS;
  }
}
