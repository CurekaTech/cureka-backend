import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { parseIndianMobileNumber } from '@modules/auth/utils/mobile-number.util';
import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import { CartResponse } from '@modules/orders/interfaces/cart-pricing.interface';
import { CartCheckoutAdminSettingsService } from '@modules/orders/services/cart-checkout-admin-settings.service';
import { CartService } from '@modules/orders/services/cart.service';
import { CouponCheckoutService } from '@modules/orders/services/coupon-checkout.service';
import { roundMoney } from '@modules/orders/utils/money.util';
import { UsersService } from '@modules/users/services/users.service';
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
  GokwikShippingAddressDto,
} from '../dto/gokwik-cart-actions.dto';

const PAYMENT_GATEWAY_KEYS = ['razor_pay', 'cash_free', 'pay_you', 'shipway'] as const;

@Injectable()
export class GokwikCartService {
  private readonly logger = new Logger(GokwikCartService.name);

  constructor(
    private readonly cartService: CartService,
    private readonly usersService: UsersService,
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly couponsRepository: CouponsRepository,
    private readonly adminSettingsRepository: AdminSettingsRepository,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
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
    const cartEntity = await this.cartService.findActiveCartById(dto.cart_id.trim());
    if (!cartEntity) {
      throw new BadRequestException('Invalid cart id');
    }
    const cart = await this.cartService.getCartById(cartEntity.id);
    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    this.logger.log(
      `set-shipping-address received: ${JSON.stringify({
        first_name: dto.shipping_address.first_name,
        last_name: dto.shipping_address.last_name,
        email: dto.shipping_address.email,
        phone: dto.shipping_address.phone,
        postal_code: dto.shipping_address.postal_code,
        city: dto.shipping_address.city,
        state: dto.shipping_address.state,
      })}`,
    );
    await this.syncUnregisteredUserFromShipping(cartEntity.userId, dto.shipping_address);

    return {
      data: {
        cart: mapCartToGokwikCart(cart, {
          ...(await this.getCartMappingOptions(cart)),
          shippingAddress: { postalCode: dto.shipping_address.postal_code },
        }),
      },
    };
  }

  /**
   * Non-blocking profile sync for unregistered users only.
   */
  private async syncUnregisteredUserFromShipping(
    userId: string,
    address: GokwikShippingAddressDto,
  ): Promise<void> {
    try {
      const phoneNumber = parseIndianMobileNumber(address.phone);

      const result = await this.usersService.syncUnregisteredProfileFromGokwik(userId, {
        firstName: address.first_name,
        lastName: address.last_name,
        email: address.email,
        phoneNumber,
        pincode: address.postal_code.trim(),
        addressLine1: address.address.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
      });

      if (result.synced) {
        this.logger.log(
          `[GoKwik] syncing unregistered user userId=${userId} reason=${result.reason}`,
        );
      } else if (result.reason === 'already_registered') {
        this.logger.log(`[GoKwik] skip already registered userId=${userId}`);
      } else {
        this.logger.warn(
          `[GoKwik] profile sync skipped userId=${userId} reason=${result.reason}`,
        );
      }
    } catch (error) {
      this.logger.error(
        {
          userId,
          err: error instanceof Error ? error.message : String(error),
        },
        '[GoKwik] set-shipping-address profile sync failed (non-blocking)',
      );
    }
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
   * Returns prepaid (when any gateway is enabled) and COD (always when configured).
   * GoKwik owns checkout UX — min/max COD order limits are not enforced here.
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
    const [checkoutAmounts, codSlabs] = await Promise.all([
      this.cartCheckoutAdminSettingsService.resolveAmounts(),
      this.cartCheckoutAdminSettingsService.resolveCodSlabs(),
    ]);
    const codCharge = this.cartCheckoutAdminSettingsService.resolveCodChargeAmount(
      payable,
      codSlabs,
      checkoutAmounts,
    );

    methods.push({
      id: 'cod',
      description: 'Cash on Delivery',
      title: 'Cash on Delivery',
      price: Math.max(0, Math.round(codCharge)),
      currency: 'INR',
    });

    this.logger.log(
      {
        cartId: cart.cartId,
        payable,
        codCharge,
        codSlabs,
        legacyCodFallback: !codSlabs.length,
        hasPrepaid,
        methodIds: methods.map((method) => method.id),
      },
      '[GoKwik] available_payment_methods resolved',
    );

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
