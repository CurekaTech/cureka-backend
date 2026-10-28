import { BadRequestException } from '@nestjs/common';
import {
  capGokwikWalletEligibleRupees,
  resolveGokwikWalletCheckoutQuote,
} from './gokwik-wallet-quote.util';

describe('gokwik-wallet-quote.util', () => {
  it('returns null when GoKwik still sends only cart_id', () => {
    expect(resolveGokwikWalletCheckoutQuote({})).toBeNull();
  });

  it('sizes the Manali leak case against GoKwik ₹75 shipping, not Cureka ₹20', () => {
    const quote = resolveGokwikWalletCheckoutQuote({
      subtotal: 158,
      shipping_amount: 75,
      discount_amount: 0,
      final_cart_total: 233,
    });
    expect(quote).toEqual({
      subtotal: 158,
      shippingAmount: 75,
      discountAmount: 0,
      finalCartTotal: 233,
    });
    expect(
      capGokwikWalletEligibleRupees({
        quotePayableRupees: quote!.finalCartTotal,
        curekaSubtotalRupees: 158,
        curekaFeeRupees: 0,
        gokwikShippingRupees: 75,
        gokwikDiscountRupees: 0,
      }),
    ).toBe(233);
    expect(
      capGokwikWalletEligibleRupees({
        quotePayableRupees: 178,
        curekaSubtotalRupees: 158,
        curekaFeeRupees: 0,
        gokwikShippingRupees: 20,
        gokwikDiscountRupees: 0,
      }),
    ).toBe(178);
  });

  it('computes payable from parts when final_cart_total is omitted', () => {
    expect(
      resolveGokwikWalletCheckoutQuote({
        subtotal: 158,
        shipping_total: 75,
        discount_total: 10,
      }),
    ).toEqual({
      subtotal: 158,
      shippingAmount: 75,
      discountAmount: 10,
      finalCartTotal: 223,
    });
  });

  it('prefers final_cart_total when the parts disagree', () => {
    expect(
      resolveGokwikWalletCheckoutQuote({
        subtotal: 158,
        shipping_amount: 75,
        discount_amount: 0,
        final_cart_total: 230,
      })?.finalCartTotal,
    ).toBe(230);
  });

  it('rejects a partial quote that cannot compute a payable', () => {
    expect(() => resolveGokwikWalletCheckoutQuote({ shipping_amount: 75 })).toThrow(
      BadRequestException,
    );
  });

  it('does not let a huge final total exceed merchandise plus GoKwik shipping', () => {
    expect(
      capGokwikWalletEligibleRupees({
        quotePayableRupees: 10_000,
        curekaSubtotalRupees: 158,
        curekaFeeRupees: 0,
        gokwikShippingRupees: 75,
        gokwikDiscountRupees: 0,
      }),
    ).toBe(233);
  });
});
