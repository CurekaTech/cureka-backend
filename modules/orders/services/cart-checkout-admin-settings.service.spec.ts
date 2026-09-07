import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminSettingsRepository } from '@modules/admin-settings/repositories/admin-settings.repository';
import { CartCheckoutAdminSettingKey } from '../config/cart-checkout-admin-settings.config';
import {
  CartCheckoutAdminSettingsService,
  COD_MINIMUM_ORDER_NOT_MET,
  ResolvedCartCheckoutAdminSettings,
} from '../services/cart-checkout-admin-settings.service';

const buildAmounts = (
  overrides: Partial<ResolvedCartCheckoutAdminSettings> = {},
): ResolvedCartCheckoutAdminSettings =>
  ({
    [CartCheckoutAdminSettingKey.COD_MIN_ORDER_AMOUNT]: 599,
    [CartCheckoutAdminSettingKey.COD_MAX_ORDER_AMOUNT]: 10000,
    ...overrides,
  }) as ResolvedCartCheckoutAdminSettings;

describe('CartCheckoutAdminSettingsService — COD eligibility', () => {
  const service = new CartCheckoutAdminSettingsService(
    {} as AdminSettingsRepository,
    { get: () => undefined } as unknown as ConfigService,
  );
  const amounts = buildAmounts();

  describe('resolveCodEligibility', () => {
    it('marks COD unavailable below the minimum payable merchandise', () => {
      const result = service.resolveCodEligibility(598.99, amounts);
      expect(result.available).toBe(false);
      expect(result.minimumOrderAmount).toBe(599);
      expect(result.message).toBe(
        'Cash on Delivery is available for orders of ₹599 or more.',
      );
    });

    it('marks COD available at exactly the minimum payable merchandise', () => {
      expect(service.resolveCodEligibility(599, amounts).available).toBe(true);
    });

    it('marks COD available above the minimum payable merchandise', () => {
      expect(service.resolveCodEligibility(750, amounts).available).toBe(true);
    });

    it('uses coupon-adjusted payable (subtotal − discount) semantics via caller input', () => {
      const payableAfterCoupon = 600 - 50;
      expect(service.resolveCodEligibility(payableAfterCoupon, amounts).available).toBe(false);
      expect(service.resolveCodEligibility(600 - 1, amounts).available).toBe(true);
    });
  });

  describe('assertCodOrderEligible', () => {
    it('throws COD_MINIMUM_ORDER_NOT_MET below the threshold', () => {
      try {
        service.assertCodOrderEligible(500, amounts);
        fail('Expected BadRequestException');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        const response = (error as BadRequestException).getResponse() as Record<string, unknown>;
        expect(response['code']).toBe(COD_MINIMUM_ORDER_NOT_MET);
        expect(response['minimumOrderAmount']).toBe(599);
        expect(response['message']).toBe(
          'Cash on Delivery is available for orders of ₹599 or more.',
        );
      }
    });

    it('allows exactly the minimum payable merchandise', () => {
      expect(() => service.assertCodOrderEligible(599, amounts)).not.toThrow();
    });

    it('allows above the minimum payable merchandise', () => {
      expect(() => service.assertCodOrderEligible(1200, amounts)).not.toThrow();
    });
  });
});
