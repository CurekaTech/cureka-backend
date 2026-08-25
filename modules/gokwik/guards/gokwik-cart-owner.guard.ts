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
  session_key?: string;
};

/**
 * Ensures the authenticated Cureka user owns the cart referenced by
 * `cart_id` or `session_key` on GoKwik merchant callbacks.
 * Compose AFTER GokwikCheckoutAuthGuard (or SessionCookieGuard) and preferably VerifiedUserGuard.
 *
 * When auth used a scoped gokwik_checkout token, also enforce cartId binding.
 */
@Injectable()
export class GokwikCartOwnerGuard implements CanActivate {
  constructor(private readonly cartService: CartService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        user?: IUserSessionContext;
        body?: GokwikCartBody;
        gokwikCheckoutCartId?: string;
      }
    >();

    const userId = request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const cartId = request.body?.cart_id?.trim() || request.body?.session_key?.trim();
    if (!cartId) {
      throw new BadRequestException('cart_id or session_key is required');
    }

    const boundCartId = request.gokwikCheckoutCartId?.trim();
    if (boundCartId && boundCartId !== cartId) {
      throw new ForbiddenException('GoKwik checkout token is not valid for this cart');
    }

    const cart = await this.cartService.findCartById(cartId);
    if (!cart) {
      throw new BadRequestException('Invalid cart id');
    }

    if (cart.userId !== userId) {
      throw new ForbiddenException('Cart does not belong to the authenticated user');
    }

    return true;
  }
}
