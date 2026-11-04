import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { CartService } from '@modules/orders/services/cart.service';
import { IUserSessionContext } from '@modules/auth/interfaces/session.interface';

type GokwikCartBody = {
  cart_id?: string;
  cartId?: string;
  session_key?: string;
};

type GokwikCartQuery = {
  cart_id?: string;
  cartId?: string;
  session_key?: string;
};

export type GokwikCartOwnerRequest = FastifyRequest & {
  user?: IUserSessionContext;
  body?: GokwikCartBody;
  query?: GokwikCartQuery;
  gokwikCheckoutCartId?: string;
  /** Real Cureka cart UUID after lookup / checkout-token fallback. */
  gokwikResolvedCartId?: string;
};

const readRequestedCartId = (request: GokwikCartOwnerRequest): string => {
  const body = request.body;
  const query = request.query;
  return (
    body?.cart_id?.trim() ||
    body?.cartId?.trim() ||
    body?.session_key?.trim() ||
    query?.cart_id?.trim() ||
    query?.cartId?.trim() ||
    query?.session_key?.trim() ||
    ''
  );
};

/**
 * Ensures the authenticated Cureka user owns the cart referenced by
 * `cart_id` or `session_key` on GoKwik merchant callbacks.
 * Compose AFTER GokwikCheckoutAuthGuard (or SessionCookieGuard) and preferably VerifiedUserGuard.
 *
 * When auth used a scoped gokwik_checkout token, also enforce cartId binding.
 * If GoKwik sends its internal cart id (not a Cureka UUID/ref id), fall back to
 * the cart bound on the checkout token so get-cart does not 500/403.
 */
@Injectable()
export class GokwikCartOwnerGuard implements CanActivate {
  constructor(private readonly cartService: CartService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<GokwikCartOwnerRequest>();

    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const requestedCartId = readRequestedCartId(request);
    const boundCartId = request.gokwikCheckoutCartId?.trim();
    if (!requestedCartId && !boundCartId) {
      throw new BadRequestException('cart_id or session_key is required');
    }

    let cart = requestedCartId ? await this.cartService.findCartById(requestedCartId) : null;
    if (!cart && boundCartId && boundCartId !== requestedCartId) {
      cart = await this.cartService.findCartById(boundCartId);
    }

    if (!cart) {
      throw new BadRequestException('Invalid cart id');
    }

    if (boundCartId && boundCartId !== cart.id) {
      throw new ForbiddenException('GoKwik checkout token is not valid for this cart');
    }

    if (cart.userId !== userId) {
      throw new ForbiddenException('Cart does not belong to the authenticated user');
    }

    request.gokwikResolvedCartId = cart.id;
    if (request.body && typeof request.body === 'object') {
      request.body.cart_id = cart.id;
      if (request.body.cartId) request.body.cartId = cart.id;
      if (request.body.session_key) request.body.session_key = cart.id;
    }

    return true;
  }
}
