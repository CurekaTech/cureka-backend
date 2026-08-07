import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { CheckoutResolverService } from '@modules/checkout/services/checkout-resolver.service';
import { UserStatus } from '@modules/users/enums/user-status.enum';
import { IUserSessionContext } from '../interfaces/session.interface';

/**
 * Strict guard for fully onboarded users.
 * Requires:
 *   - Valid session cookie (via SessionCookieGuard)
 *   - isGuest === false
 *   - isRegistered === true (completed profile)
 *   - status === ACTIVE
 *
 * Always compose AFTER SessionCookieGuard.
 */
@Injectable()
export class VerifiedUserGuard implements CanActivate {
  constructor(private readonly checkoutResolver: CheckoutResolverService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user: IUserSessionContext }>();

    const sessionUser = request.user;

    if (!sessionUser?.sub) {
      throw new UnauthorizedException('Authentication required');
    }

    if (sessionUser.isGuest === true) {
      throw new ForbiddenException('Guest users cannot access this resource');
    }

    if (sessionUser.status === UserStatus.INACTIVE) {
      throw new ForbiddenException('Account is inactive');
    }

    if (!sessionUser.isRegistered && !(await this.isAllowedForUnregistered(request))) {
      throw new ForbiddenException(
        'Please complete your profile registration before accessing this resource',
      );
    }

    return true;
  }

  /**
   * Allow pre-registration (mobile-only) users only when GoKwik checkout is active.
   * Covers:
   * - address list/CRUD (FE may call these)
   * - checkout start endpoints
   * - GoKwik merchant cart/order callbacks (get-cart, create-order, etc.)
   */
  private async isAllowedForUnregistered(request: FastifyRequest): Promise<boolean> {
    const method = String(request.method ?? '').toUpperCase();
    const rawPath = String(request.url ?? '');
    const path = rawPath.split('?')[0];

    const isAddressRoute = path.startsWith('/api/v1/users/addresses');
    const isCheckoutStartRoute =
      method === 'POST' &&
      (path === '/api/v1/orders/checkout' ||
        path === '/api/v1/payment-requests/checkout' ||
        path === '/api/v1/payment-requests/checkout/modal');
    const isGokwikMerchantRoute = path.startsWith('/api/v1/gokwik/');

    if (!isAddressRoute && !isCheckoutStartRoute && !isGokwikMerchantRoute) {
      return false;
    }

    const provider = await this.checkoutResolver.resolveProvider();
    return provider === 'gokwik';
  }
}
