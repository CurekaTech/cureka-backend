import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { SessionService } from '../services/session.service';
import { IUserSessionContext } from '../interfaces/session.interface';
import { getSessionTokenFromRequest } from '../utils/auth-cookie.util';
import { SESSION_PURPOSE_GOKWIK_CHECKOUT } from '../constants/session-purpose.constants';

/**
 * Storefront session auth for ecommerce users — opaque session token (not JWT).
 * Accepts `user_session` cookie or `Authorization: Bearer <token>`.
 *
 * Rejects short-lived `gokwik_checkout` tokens so stolen GoKwik customerTokens
 * cannot call normal storefront APIs (/auth/me, /orders, /users/profile, …).
 */
@Injectable()
export class SessionCookieGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IUserSessionContext }>();

    const sessionToken = getSessionTokenFromRequest(request);
    if (!sessionToken) {
      throw new UnauthorizedException(
        'Session missing — provide user_session cookie or Authorization: Bearer <token>',
      );
    }

    const user = await this.sessionService.resolveSessionFromToken(sessionToken);
    if (user.purpose === SESSION_PURPOSE_GOKWIK_CHECKOUT) {
      throw new UnauthorizedException(
        'GoKwik checkout token cannot authenticate this endpoint — use user_session',
      );
    }

    request.user = user;
    return true;
  }
}
