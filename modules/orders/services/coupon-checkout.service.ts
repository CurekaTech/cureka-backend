import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { CouponApplicabilityScope } from '@modules/master/enums/coupon-applicability-scope.enum';
import { CouponDiscountType } from '@modules/master/enums/coupon-discount-type.enum';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { CouponsRepository } from '@modules/master/repositories/coupons.repository';
import {
  calculateEligibleSubtotal,
  CouponEligibleCartItem,
} from '../utils/coupon-applicability.util';
import { CouponUsagesRepository } from '../repositories/coupon-usages.repository';
import { parseMoney, roundMoney } from '../utils/money.util';

export type CouponValidationContext = {
  userId: string;
  subtotal: number;
  items: CouponEligibleCartItem[];
  manager?: EntityManager;
};

@Injectable()
export class CouponCheckoutService {
  constructor(
    private readonly couponsRepository: CouponsRepository,
    private readonly couponUsagesRepository: CouponUsagesRepository,
  ) {}

  async findByCode(code: string): Promise<CouponEntity | null> {
    return this.couponsRepository.findByCode(code);
  }

  async findById(id: string): Promise<CouponEntity | null> {
    return this.couponsRepository.findById(id);
  }

  async validateCoupon(coupon: CouponEntity, context: CouponValidationContext): Promise<void> {
    const now = new Date();

    if (coupon.status !== MasterStatus.ACTIVE) {
      throw new BadRequestException('Coupon is not active');
    }

    if (now < coupon.startDate) {
      throw new BadRequestException('Coupon is not yet valid');
    }

    if (now > coupon.expiryDate) {
      throw new BadRequestException('Coupon has expired');
    }

    if (!context.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const discountBase = this.getDiscountSubtotal(coupon, context);
    const minPurchase = parseMoney(coupon.minPurchase);

    if (coupon.applicabilityScope !== CouponApplicabilityScope.ALL && discountBase <= 0) {
      throw new BadRequestException('Coupon is not applicable to any items in your cart');
    }

    if (discountBase < minPurchase) {
      throw new BadRequestException(
        `Minimum purchase of ${minPurchase.toFixed(2)} is required for eligible items`,
      );
    }

    if (coupon.sameUserLimit !== null) {
      const usageCount = await this.couponUsagesRepository.countByCouponAndUser(
        coupon.id,
        context.userId,
        context.manager,
      );
      if (usageCount >= coupon.sameUserLimit) {
        throw new BadRequestException('Coupon usage limit reached for this user');
      }
    }
  }

  getDiscountSubtotal(coupon: CouponEntity, context: CouponValidationContext): number {
    if (coupon.applicabilityScope === CouponApplicabilityScope.ALL) {
      return context.subtotal;
    }
    return roundMoney(calculateEligibleSubtotal(coupon, context.items));
  }

  calculateDiscount(coupon: CouponEntity, eligibleSubtotal: number): number {
    const discountValue = parseMoney(coupon.discountAmount);
    if (eligibleSubtotal <= 0) {
      return 0;
    }

    let discount =
      coupon.discountType === CouponDiscountType.PERCENTAGE
        ? (eligibleSubtotal * discountValue) / 100
        : discountValue;

    discount = Math.min(discount, eligibleSubtotal);

    const maxDiscount = parseMoney(coupon.maxDiscount);
    if (maxDiscount > 0) {
      discount = Math.min(discount, maxDiscount);
    }

    return roundMoney(discount);
  }

  async incrementUsage(
    params: {
      couponId: string;
      userId: string;
      orderId: string;
      discountAmount: number;
    },
    manager?: EntityManager,
  ): Promise<void> {
    await this.couponUsagesRepository.create(
      {
        couponId: params.couponId,
        userId: params.userId,
        orderId: params.orderId,
        discountAmount: roundMoney(params.discountAmount).toFixed(2),
      },
      manager,
    );
  }
}
