import { Injectable, Logger } from '@nestjs/common';
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
import { CodBlocklistService } from '@modules/cod-blocklist/services/cod-blocklist.service';

@Injectable()
export class CartPricingService {
  private readonly logger = new Logger(CartPricingService.name);

  constructor(
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartsRepository: CartsRepository,
    private readonly cartCheckoutAdminSettingsService: CartCheckoutAdminSettingsService,
    private readonly codBlocklistService: CodBlocklistService,
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
    deliveryPincode?: string;
    checkoutMobile?: string;
  }): Promise<CartPricing> {
    const subtotal = roundMoney(params.items.reduce((sum, item) => sum + item.totalPrice, 0));

    const [checkoutAdminSettings, shippingSlabs, codSlabs] = await Promise.all([
      this.cartCheckoutAdminSettingsService.resolveAmounts(),
      this.cartCheckoutAdminSettingsService.resolveShippingSlabs(),
      this.cartCheckoutAdminSettingsService.resolveCodSlabs(),
    ]);
    const settings = this.cartCheckoutAdminSettingsService;
    const checkoutRules = {
      prepaidDiscountPercent: settings.getPrepaidDiscountPercent(checkoutAdminSettings),
      codMinOrderAmount: settings.getCodMinOrderAmount(checkoutAdminSettings),
      codMaxOrderAmount: settings.getCodMaxOrderAmount(checkoutAdminSettings),
    };

    if (!params.items.length) {
      const cod = await this.codBlocklistService.overlayNativeCodEligibility(
        settings.resolveCodEligibility(0, checkoutAdminSettings),
        {
          customerId: params.userId,
          mobileNumber: params.checkoutMobile,
          pincode: params.deliveryPincode,
        },
      );
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
        cod,
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

    // Merchandise payable (products after coupon). Fee thresholds use this base.
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

    // COD charge: slab-based from admin `cod_charge` JSON (merchandise payable base).
    const codCharge =
      params.paymentMethod === OrderPaymentMethod.COD
        ? settings.resolveCodChargeAmount(payableSubtotal, codSlabs, checkoutAdminSettings)
        : 0;

    if (params.paymentMethod === OrderPaymentMethod.COD) {
      const matchedSlab = codSlabs.find(
        (candidate) =>
          payableSubtotal >= candidate.min &&
          (candidate.max === null || payableSubtotal <= candidate.max),
      );
      this.logger.log(
        {
          cartId: params.cartId,
          payableSubtotal,
          codCharge,
          matchedSlab: matchedSlab
            ? { min: matchedSlab.min, max: matchedSlab.max, charge: matchedSlab.charge }
            : null,
          codSlabs,
          legacyFallback: !codSlabs.length,
        },
        'COD charge resolved from admin slabs',
      );
    }

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

    // Shipping slabs use merchandise payable only: subtotal − coupon (before fees).
    const shippingAmount = this.resolveShippingAmount(
      payableSubtotal,
      coupon,
      shippingSlabs,
      {
        cartId: params.cartId,
        subtotal,
        discountAmount,
        payableSubtotal,
        handlingAmount,
        platformFee,
        codCharge,
      },
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
      checkoutRules,
      cod: await this.codBlocklistService.overlayNativeCodEligibility(
        settings.resolveCodEligibility(payableSubtotal, checkoutAdminSettings),
        {
          customerId: params.userId,
          mobileNumber: params.checkoutMobile,
          pincode: params.deliveryPincode,
        },
      ),
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
    cod: CartPricing['cod'];
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
      cod: parts.cod,
    };
  }

  /**
   * Shipping charge from `gokwik_shipping_slabs`.
   * Slab base = merchandise payable: `subtotal − discountAmount` (coupon, etc.).
   * Handling, platform fee, and COD are applied after shipping in the grand total.
   * Used by Cureka cart, checkout, GoKwik get-cart. `free_shipping` coupons waive shipping.
   */
  resolveShippingAmount(
    payableSubtotal: number,
    coupon: CouponEntity | null,
    shippingSlabs: ShippingSlab[],
    debug?: {
      cartId?: string;
      subtotal?: number;
      discountAmount?: number;
      payableSubtotal?: number;
      handlingAmount?: number;
      platformFee?: number;
      codCharge?: number;
    },
  ): number {
    if (coupon?.couponType.trim().toLowerCase() === 'free_shipping') {
      this.logger.log(
        {
          cartId: debug?.cartId,
          payableSubtotal,
          shippingAmount: 0,
          reason: 'free_shipping_coupon',
          couponCode: coupon.code,
        },
        'Shipping resolved',
      );
      return 0;
    }

    const matchedSlab = shippingSlabs.find(
      (candidate) =>
        payableSubtotal >= candidate.min &&
        (candidate.max === null || payableSubtotal <= candidate.max),
    );
    const shippingAmount = roundMoney(matchedSlab?.charge ?? 0);

    this.logger.log(
      {
        cartId: debug?.cartId,
        subtotal: debug?.subtotal,
        discountAmount: debug?.discountAmount,
        payableSubtotal,
        handlingAmount: debug?.handlingAmount,
        platformFee: debug?.platformFee,
        codCharge: debug?.codCharge,
        matchedSlab: matchedSlab
          ? { min: matchedSlab.min, max: matchedSlab.max, charge: matchedSlab.charge }
          : null,
        shippingAmount,
        slabs: shippingSlabs,
      },
      'Shipping resolved from admin slabs',
    );

    return shippingAmount;
  }

  private toCouponSummary(coupon: CouponEntity): CartCouponSummary {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
    };
  }
}
