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
import { CouponCheckoutService } from './coupon-checkout.service';

@Injectable()
export class CartPricingService {
  private readonly freeShippingThreshold: number;
  private readonly flatShippingFee: number;

  constructor(
    private readonly couponCheckoutService: CouponCheckoutService,
    private readonly cartsRepository: CartsRepository,
    configService: ConfigService,
  ) {
    this.freeShippingThreshold = configService.get<number>('orders.shipping.freeThreshold', 900);
    this.flatShippingFee = configService.get<number>('orders.shipping.flatFee', 50);
  }

  async calculateCartPricing(params: {
    userId: string;
    cartId: string;
    couponId: string | null;
    items: CartLineItem[];
    manager?: EntityManager;
    clearInvalidCoupon?: boolean;
    strict?: boolean;
  }): Promise<CartPricing> {
    const subtotal = roundMoney(params.items.reduce((sum, item) => sum + item.totalPrice, 0));
    const handlingAmount = this.calculateHandlingAmount(subtotal);

    if (!params.items.length) {
      return this.buildPricing({
        subtotal,
        coupon: null,
        discountAmount: 0,
        shippingAmount: 0,
        handlingAmount,
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

    const payableBeforeShipping = roundMoney(subtotal - discountAmount);
    const shippingAmount = this.resolveShippingAmount(payableBeforeShipping, coupon);

    return this.buildPricing({
      subtotal,
      coupon: coupon ? this.toCouponSummary(coupon) : null,
      discountAmount,
      shippingAmount,
      handlingAmount,
    });
  }

  buildPricing(parts: {
    subtotal: number;
    coupon: CartCouponSummary;
    discountAmount: number;
    shippingAmount: number;
    handlingAmount: number;
  }): CartPricing {
    const grandTotal = roundMoney(
      parts.subtotal - parts.discountAmount + parts.shippingAmount + parts.handlingAmount,
    );

    return {
      subtotal: parts.subtotal,
      coupon: parts.coupon,
      discountAmount: parts.discountAmount,
      shippingAmount: parts.shippingAmount,
      handlingAmount: parts.handlingAmount,
      grandTotal: Math.max(0, grandTotal),
    };
  }

  /**
   * Shipping is free when payable amount (subtotal − discount) is ≥ threshold.
   * `free_shipping` coupons always waive shipping.
   */
  resolveShippingAmount(payableBeforeShipping: number, coupon: CouponEntity | null): number {
    if (coupon?.couponType.trim().toLowerCase() === 'free_shipping') {
      return 0;
    }

    if (payableBeforeShipping >= this.freeShippingThreshold) {
      return 0;
    }

    return roundMoney(this.flatShippingFee);
  }

  /** Placeholder for packaging/handling fee rules. */
  calculateHandlingAmount(_subtotal: number): number {
    return 0;
  }

  private toCouponSummary(coupon: CouponEntity): CartCouponSummary {
    return {
      id: coupon.id,
      code: coupon.code,
      title: coupon.title,
    };
  }
}
