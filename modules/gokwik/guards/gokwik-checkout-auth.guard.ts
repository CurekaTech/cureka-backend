import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';
import { getSessionTokenFromRequest } from '@modules/auth/utils/auth-cookie.util';
import { GokwikCheckoutTokenService } from '@modules/auth/services/gokwik-checkout-token.service';

export type GokwikAuthedRequest = FastifyRequest & {
  user: IUserSessionContext;
  /** Present when auth came from a scoped gokwik_checkout token. */
  gokwikCheckoutCartId?: string;
  gokwikCheckoutJti?: string;
};

/**
 * Auth for GoKwik merchant callbacks.
 * Accepts only short-lived opaque `gokwik_checkout` Bearer tokens.
 * Long-lived `user_session` / purpose=login is rejected (401).
 */
@Injectable()
export class GokwikCheckoutAuthGuard implements CanActivate {
  constructor(private readonly gokwikCheckoutTokenService: GokwikCheckoutTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GokwikAuthedRequest>();
    const token = getSessionTokenFromRequest(request);
    if (!token) {
      throw new UnauthorizedException(
        'Session missing — provide Authorization: Bearer <gokwik_checkout_token>',
      );
    }

    const resolved = await this.gokwikCheckoutTokenService.resolveToSessionContext(token);
    request.user = resolved.context;
    request.gokwikCheckoutCartId = resolved.cartId;
    request.gokwikCheckoutJti = resolved.jti;
    return true;
  }
}
