import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import {
  CartCouponSummary,
  CartLineItem,
  CartPricing,
} from '../interfaces/cart-pricing.interface';
import { CartsRepository } from '../repositories/carts.repository';
import { roundMoney } from '../utils/money.util';
import {
  CartCheckoutAdminSettingsService,
  ResolvedCartCheckoutAdminSettings,
} from './cart-checkout-admin-settings.service';
import { CouponCheckoutService } from './coupon-checkout.service';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';

@Injectable()
export class CartPricingService {
  private readonly flatShippingFee: number;

  constructor(
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartsRepository: CartsRepository,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
    configService: ConfigService,
  ) {
    this.flatShippingFee = configService.get<number>('orders.shipping.flatFee', 50);
  }

  async calculateCartPricing(params: {
    userId: string;
    cartId: string;
    couponId: string | null;
    items: CartLineItem[];
    paymentMethod?: OrderPaymentMethod;
    manager?: EntityManager;
    clearInvalidCoupon?: boolean;
    strict?: boolean;
  }): Promise<CartPricing> {
    const subtotal = roundMoney(params.items.reduce((sum, item) => sum + item.totalPrice, 0));

    if (!params.items.length) {
      return this.buildPricing({
        subtotal,
        coupon: null,
        discountAmount: 0,
        shippingAmount: 0,
        handlingAmount: 0,
        platformFee: 0,
        codCharge: 0,
        prepaidDiscount: 0,
      });
    }

    const checkoutAdminSettings = await this.cartCheckoutAdminSettingsService.resolveAmounts();

    let coupon: CouponEntity | null = null;
    let discountAmount = 0;

    if (params.couponId) {
      coupon = await this.couponCheckoutService.findById(params.couponId);

      if (!coupon) {
        if (params.clearInvalidCoupon) {
          await this.cartsRepository.updateById(
            params.cartId,
            { couponId: null },
            params.manager,
          );
        }
      } else {
        try {
          await this.couponCheckoutService.validateCoupon(coupon, {
            userId: params.userId,
            subtotal,
            items: params.items,
            manager: params.manager,
          });
          const eligibleSubtotal = this.couponCheckoutService.getDiscountSubtotal(coupon, {
            userId: params.userId,
            subtotal,
            items: params.items,
            manager: params.manager,
          });
          discountAmount = this.couponCheckoutService.calculateDiscount(coupon, eligibleSubtotal);
        } catch (error) {
          if (params.strict) {
            throw error;
          }
          if (params.clearInvalidCoupon) {
            await this.cartsRepository.updateById(
              params.cartId,
              { couponId: null },
              params.manager,
            );
          }
          coupon = null;
          discountAmount = 0;
        }
      }
    }

    // All threshold-based charges compare against the order payable amount
    // (subtotal − discount), matching the admin-setting descriptions.
    const payableBeforeShipping = roundMoney(subtotal - discountAmount);
    const settings = this.cartCheckoutAdminSettingsService;

    // Handling charge: applied while payable ≤ handling_charge_threshold.
    const handlingAmount = settings.isChargeApplicable(
      payableBeforeShipping,
      settings.getHandlingChargeThreshold(checkoutAdminSettings),
    )
      ? settings.getHandlingCharge(checkoutAdminSettings)
      : 0;

    // Platform fee: waived once subtotal reaches the platform-fee threshold.
    const platformFee =
      subtotal < settings.getPlatformFeeThreshold(checkoutAdminSettings)
        ? settings.getPlatformFee(checkoutAdminSettings)
        : 0;

    // COD charge: only for COD orders, and only while payable ≤ cod_charge_threshold.
    const codCharge =
      params.paymentMethod === OrderPaymentMethod.COD &&
      settings.isChargeApplicable(
        payableBeforeShipping,
        settings.getCodChargeThreshold(checkoutAdminSettings),
      )
        ? settings.getCodCharge(checkoutAdminSettings)
        : 0;

    // Prepaid discount: only for prepaid (non-COD) orders, while payable ≤ prepaid_charge_threshold.
    const isPrepaidPayment =
      params.paymentMethod !== undefined && params.paymentMethod !== OrderPaymentMethod.COD;
    const prepaidDiscount =
      isPrepaidPayment &&
      settings.isChargeApplicable(
        payableBeforeShipping,
        settings.getPrepaidChargeThreshold(checkoutAdminSettings),
      )
        ? settings.getPrepaidCharge(checkoutAdminSettings)
        : 0;

    const shippingAmount = this.resolveShippingAmount(
      payableBeforeShipping,
      coupon,
      checkoutAdminSettings,
    );

    return this.buildPricing({
      subtotal,
      coupon: coupon ? this.toCouponSummary(coupon) : null,
      discountAmount,
      shippingAmount,
      handlingAmount,
      platformFee,
      codCharge,
      prepaidDiscount,
    });
  }

  buildPricing(parts: {
    subtotal: number;
    coupon: CartCouponSummary;
    discountAmount: number;
    shippingAmount: number;
    handlingAmount: number;
    platformFee: number;
    codCharge: number;
    prepaidDiscount: number;
  }): CartPricing {
    const grandTotal = roundMoney(
      parts.subtotal -
        parts.discountAmount +
        parts.shippingAmount +
        parts.handlingAmount +
        parts.platformFee +
        parts.codCharge -
        parts.prepaidDiscount,
    );

    return {
      subtotal: parts.subtotal,
      coupon: parts.coupon,
      discountAmount: parts.discountAmount,
      shippingAmount: parts.shippingAmount,
      handlingAmount: parts.handlingAmount,
      platformFee: parts.platformFee,
      codCharge: parts.codCharge,
      prepaidDiscount: parts.prepaidDiscount,
      grandTotal: Math.max(0, grandTotal),
    };
  }

  /**
   * Shipping is free when payable amount (subtotal − discount) is >= threshold.
   * Threshold comes from checkout admin settings (`shipping_charge_threshold`).
   * `free_shipping` coupons always waive shipping.
   */
  resolveShippingAmount(
    payableBeforeShipping: number,
    coupon: CouponEntity | null,
    checkoutAdminSettings: ResolvedCartCheckoutAdminSettings,
  ): number {
    if (coupon?.couponType.trim().toLowerCase() === 'free_shipping') {
      return 0;
    }

    const freeShippingThreshold =
      this.cartCheckoutAdminSettingsService.getFreeShippingThreshold(checkoutAdminSettings);

    if (payableBeforeShipping >= freeShippingThreshold) {
      return 0;
    }

    const shippingCharge =
      this.cartCheckoutAdminSettingsService.getShippingCharge(checkoutAdminSettings);
    return roundMoney(shippingCharge);
  }

  private toCouponSummary(coupon: CouponEntity): CartCouponSummary {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
    };
  }
}
