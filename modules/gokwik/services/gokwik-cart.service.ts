import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { CartService } from '@modules/orders/services/cart.service';
import { CouponCheckoutService } from '@modules/orders/services/coupon-checkout.service';
import {
  GokwikAvailableCouponsResponse,
  GokwikGetCartSuccessResponse,
} from '../interfaces/gokwik-cart.interface';
import { mapCartToGokwikCart } from '../mappers/gokwik-cart.mapper';
import {
  GokwikDiscountDto,
  GokwikSetShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';

@Injectable()
export class GokwikCartService {
  constructor(
    private readonly cartService: CartService,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly couponsRepository: CouponsRepository,
    private readonly configService: ConfigService,
  ) {}

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
        cart: mapCartToGokwikCart(cart, { origin: this.getOrigin() }),
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
        cart: mapCartToGokwikCart(cart, { origin: this.getOrigin() }),
      },
    };
  }

  async setShippingAddress(
    dto: GokwikSetShippingAddressDto,
  ): Promise<GokwikGetCartSuccessResponse> {
    const cart = await this.cartService.getCartById(dto.cart_id.trim());
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }
    return {
      data: {
        cart: mapCartToGokwikCart(cart, {
          origin: this.getOrigin(),
          shippingAddress: { postalCode: dto.shipping_address.postal_code },
        }),
      },
    };
  }

  async getAvailableCoupons(cartId: string): Promise<GokwikAvailableCouponsResponse> {
    const cartEntity = await this.cartService.findActiveCartById(cartId.trim());
    if (!cartEntity) throw new BadRequestException('Invalid cart id');
    const [cart, coupons] = await Promise.all([
      this.cartService.getCartById(cartEntity.id),
      this.couponsRepository.findAllActiveValid(),
    ]);
    const context = {
      userId: cartEntity.userId,
      subtotal: cart.subtotal,
      items: cart.items,
    };
    const availableCoupons = await Promise.all(
      coupons.map(async (coupon) => {
        try {
          await this.couponCheckoutService.validateCoupon(coupon, context);
          const eligibleSubtotal = this.couponCheckoutService.getDiscountSubtotal(
            coupon,
            context,
          );
          return {
            amount: this.couponCheckoutService.calculateDiscount(coupon, eligibleSubtotal),
            code: coupon.code,
            description: coupon.title,
            type: coupon.discountType,
            tnc: `Valid until ${coupon.expiryDate.toISOString()}`,
            eligibility: 'eligible',
          };
        } catch (error) {
          return {
            amount: 0,
            code: coupon.code,
            description: coupon.title,
            type: coupon.discountType,
            tnc: `Valid until ${coupon.expiryDate.toISOString()}`,
            eligibility: error instanceof Error ? error.message : 'ineligible',
          };
        }
      }),
    );
    return { data: { available_coupons: availableCoupons } };
  }

  async applyDiscount(dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    const cart = await this.requireCart(dto.cart_id);
    const updated = await this.cartService.applyCoupon(cart.userId, {
      couponCode: dto.discount_code.trim(),
    });
    return { data: { cart: mapCartToGokwikCart(updated, { origin: this.getOrigin() }) } };
  }

  async removeDiscount(dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    const cart = await this.requireCart(dto.cart_id);
    if (cart.coupon?.code && cart.coupon.code !== dto.discount_code.trim()) {
      throw new BadRequestException('Discount code is not applied to this cart');
    }
    const updated = await this.cartService.removeCoupon(cart.userId);
    return { data: { cart: mapCartToGokwikCart(updated, { origin: this.getOrigin() }) } };
  }

  private async requireCart(cartId: string) {
    const cart = await this.cartService.findActiveCartById(cartId.trim());
    if (!cart) throw new BadRequestException('Invalid cart id');
    return cart;
  }

  private getOrigin() {
    return {
      city: this.configService.get<string>('gokwik.origin.city') ?? '',
      state: this.configService.get<string>('gokwik.origin.state') ?? '',
      pincode: this.configService.get<string>('gokwik.origin.pincode') ?? '',
      country: this.configService.get<string>('gokwik.origin.country') ?? 'India',
    };
  }
}
