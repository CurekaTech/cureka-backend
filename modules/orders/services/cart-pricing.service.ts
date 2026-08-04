import { Injectable } from '@nestjs/common';
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
  ShippingSlab,
} from './cart-checkout-admin-settings.service';
import { CouponCheckoutService } from './coupon-checkout.service';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { isPrepaidPaymentMethod } from '../utils/payment-method.util';

@Injectable()
export class CartPricingService {
  constructor(
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartsRepository: CartsRepository,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
  ) {}

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

    const [checkoutAdminSettings, shippingSlabs] = await Promise.all([
      this.cartCheckoutAdminSettingsService.resolveAmounts(),
      this.cartCheckoutAdminSettingsService.resolveShippingSlabs(),
    ]);
    const settings = this.cartCheckoutAdminSettingsService;
    const checkoutRules = {
      prepaidDiscountPercent: settings.getPrepaidDiscountPercent(checkoutAdminSettings),
      codMinOrderAmount: settings.getCodMinOrderAmount(checkoutAdminSettings),
      codMaxOrderAmount: settings.getCodMaxOrderAmount(checkoutAdminSettings),
    };

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
        checkoutRules,
      });
    }

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

    // Payable merchandise amount the customer owes for products (before shipping/fees).
    // Shipping slabs + fee thresholds all use this same base for Cureka + GoKwik carts.
    const payableSubtotal = roundMoney(subtotal - discountAmount);

    // Handling charge: applied while payable ≤ handling_charge_threshold.
    const handlingAmount = settings.isChargeApplicable(
      payableSubtotal,
      settings.getHandlingChargeThreshold(checkoutAdminSettings),
    )
      ? settings.getHandlingCharge(checkoutAdminSettings)
      : 0;

    // Platform fee: waived once payable merchandise reaches the platform-fee threshold.
    const platformFee =
      payableSubtotal < settings.getPlatformFeeThreshold(checkoutAdminSettings)
        ? settings.getPlatformFee(checkoutAdminSettings)
        : 0;

    // COD charge: only for COD orders, and only while payable ≤ cod_charge_threshold.
    const codCharge =
      params.paymentMethod === OrderPaymentMethod.COD &&
      settings.isChargeApplicable(
        payableSubtotal,
        settings.getCodChargeThreshold(checkoutAdminSettings),
      )
        ? settings.getCodCharge(checkoutAdminSettings)
        : 0;

    const isPrepaidPayment = isPrepaidPaymentMethod(params.paymentMethod);

    // Percent prepaid discount: applied on every product line total when prepaid.
    const prepaidPercent = checkoutRules.prepaidDiscountPercent;
    const prepaidPercentDiscount =
      isPrepaidPayment && prepaidPercent > 0
        ? roundMoney(
            params.items.reduce(
              (sum, item) => sum + roundMoney((item.totalPrice * prepaidPercent) / 100),
              0,
            ),
          )
        : 0;

    // Optional flat prepaid discount (legacy admin `prepaid_charge` + threshold).
    const prepaidFlatDiscount =
      isPrepaidPayment &&
      settings.isChargeApplicable(
        payableSubtotal,
        settings.getPrepaidChargeThreshold(checkoutAdminSettings),
      )
        ? settings.getPrepaidCharge(checkoutAdminSettings)
        : 0;

    const prepaidDiscount = roundMoney(prepaidPercentDiscount + prepaidFlatDiscount);

    const shippingAmount = this.resolveShippingAmount(payableSubtotal, coupon, shippingSlabs);

    return this.buildPricing({
      subtotal,
      coupon: coupon ? this.toCouponSummary(coupon) : null,
      discountAmount,
      shippingAmount,
      handlingAmount,
      platformFee,
      codCharge,
      prepaidDiscount,
      checkoutRules,
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
    checkoutRules: CartPricing['checkoutRules'];
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
      checkoutRules: parts.checkoutRules,
    };
  }

  /**
   * Shipping charge from `gokwik_shipping_slabs`, keyed by payable merchandise
   * amount (`subtotal − coupon discount`). Used by Cureka cart and GoKwik get-cart.
   * `free_shipping` coupons always waive shipping.
   */
  resolveShippingAmount(
    payableSubtotal: number,
    coupon: CouponEntity | null,
    shippingSlabs: ShippingSlab[],
  ): number {
    if (coupon?.couponType.trim().toLowerCase() === 'free_shipping') {
      return 0;
    }

    const slab = shippingSlabs.find(
      (candidate) =>
        payableSubtotal >= candidate.min &&
        (candidate.max === null || payableSubtotal <= candidate.max),
    );
    return roundMoney(slab?.charge ?? 0);
  }

  private toCouponSummary(coupon: CouponEntity): CartCouponSummary {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
    };
  }
}
