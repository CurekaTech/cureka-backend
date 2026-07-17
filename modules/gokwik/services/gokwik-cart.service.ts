import { BadRequestException, Injectable } from '@nestjs/common';
import { CartService } from '@modules/orders/services/cart.service';
import { GokwikGetCartSuccessResponse } from '../interfaces/gokwik-cart.interface';
import { mapCartToGokwikCart } from '../mappers/gokwik-cart.mapper';

@Injectable()
export class GokwikCartService {
  constructor(private readonly cartService: CartService) {}

  async getCart(cartId: string): Promise<GokwikGetCartSuccessResponse> {
    const trimmed = cartId?.trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid cart id');
    }

    const cart = await this.cartService.getCartById(trimmed);
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    return {
      data: {
        cart: mapCartToGokwikCart(cart),
      },
    };
  }

  async removeOutOfStockItems(cartId: string): Promise<GokwikGetCartSuccessResponse> {
    const trimmed = cartId?.trim();
    if (!trimmed) {
      throw new BadRequestException('Invalid cart id');
    }

    const cart = await this.cartService.removeOutOfStockItemsByCartId(trimmed);

    return {
      data: {
        cart: mapCartToGokwikCart(cart),
      },
    };
  }
}
