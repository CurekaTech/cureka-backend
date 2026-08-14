import { Injectable } from '@nestjs/common';

@Injectable()
export class MembershipPricingService {
  /** Plan price is the source of truth — never trust frontend amounts. */
  calculate(planPrice: string | number): { amount: string } {
    const amount = Number(planPrice);
    return { amount: (Math.round((Math.max(0, amount) + Number.EPSILON) * 100) / 100).toFixed(2) };
  }
}
