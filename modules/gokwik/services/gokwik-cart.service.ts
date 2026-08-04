import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import { CartService } from '@modules/orders/services/cart.service';
import { CouponCheckoutService } from '@modules/orders/services/coupon-checkout.service';
import { roundMoney } from '@modules/orders/utils/money.util';
import {
  GokwikAvailableCouponsResponse,
  GokwikAvailablePaymentMethod,
  GokwikGetCartSuccessResponse,
} from '../interfaces/gokwik-cart.interface';
import {
  mapCartToGokwikCart,
} from '../mappers/gokwik-cart.mapper';
import {
  GokwikDiscountDto,
  GokwikSetShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';

const PAYMENT_GATEWAY_KEYS = ['razor_pay', 'cash_free', 'pay_you', 'shipway'] as const;

@Injectable()
export class GokwikCartService {
  constructor(
    private readonly cartService: CartService,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly couponsRepository: CouponsRepository,
    private readonly adminSettingsRepository: AdminSettingsRepository,
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
        cart: mapCartToGokwikCart(cart, await this.getCartMappingOptions(cart)),
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
        cart: mapCartToGokwikCart(cart, await this.getCartMappingOptions(cart)),
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
          ...(await this.getCartMappingOptions(cart)),
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
    return {
      data: {
        cart: mapCartToGokwikCart(updated, await this.getCartMappingOptions(updated)),
      },
    };
  }

  async removeDiscount(dto: GokwikDiscountDto): Promise<GokwikGetCartSuccessResponse> {
    const cart = await this.requireCart(dto.cart_id);
    if (cart.coupon?.code && cart.coupon.code !== dto.discount_code.trim()) {
      throw new BadRequestException('Discount code is not applied to this cart');
    }
    const updated = await this.cartService.removeCoupon(cart.userId);
    return {
      data: {
        cart: mapCartToGokwikCart(updated, await this.getCartMappingOptions(updated)),
      },
    };
  }

  private async requireCart(cartId: string) {
    const cart = await this.cartService.findActiveCartById(cartId.trim());
    if (!cart) throw new BadRequestException('Invalid cart id');
    return cart;
  }

  private async getCartMappingOptions(cart: CartResponse) {
    return {
      availablePaymentMethods: await this.resolveAvailablePaymentMethods(cart),
      availableShippingMethods: this.resolveAvailableShippingMethods(cart.shippingAmount),
    };
  }

  /**
   * Returns prepaid (when any gateway is enabled) and COD (when payable is within admin min/max).
   */
  private async resolveAvailablePaymentMethods(
    cart: CartResponse,
  ): Promise<GokwikAvailablePaymentMethod[]> {
    const settings = await this.adminSettingsRepository.findByKeys([...PAYMENT_GATEWAY_KEYS]);
    const hasPrepaid = settings.some((setting) => {
      const value = String(setting.value ?? '')
        .toLowerCase()
        .trim();
      return (
        setting.status === AdminSettingStatus.ACTIVE ||
        ['1', 'true', 'yes', 'on'].includes(value)
      );
    });
    const methods: GokwikAvailablePaymentMethod[] = [];
    if (hasPrepaid) {
      methods.push({
        id: 'prepaid',
        description: 'Prepaid',
        title: 'Prepaid',
        price: 0,
        currency: 'INR',
      });
    }

    const payable = roundMoney(cart.subtotal - cart.discountAmount);
    const min = cart.checkoutRules.codMinOrderAmount;
    const max = cart.checkoutRules.codMaxOrderAmount;
    if (payable >= min && payable <= max) {
      methods.push({
        id: 'cod',
        description: 'Cash on Delivery',
        title: 'Cash on Delivery',
        price: Math.max(0, Math.round(Number(cart.codCharge) || 0)),
        currency: 'INR',
      });
    }
    return methods;
  }

  /**
   * Returns only one shipping option based on current cart charge.
   */
  private resolveAvailableShippingMethods(shippingAmount: number) {
    const isChargeable = (Number(shippingAmount) || 0) > 0;
    if (isChargeable) {
      return [
        {
          id: 'shipping',
          price: Number(shippingAmount),
          title: 'Shipping',
          currency: 'INR',
        },
      ];
    }

    return [
      {
        id: 'free_shipping',
        price: 0,
        title: 'Free Shipping',
        currency: 'INR',
      },
    ];
  }
}
