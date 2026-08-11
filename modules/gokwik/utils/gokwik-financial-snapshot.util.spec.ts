import { OrderEntity } from '@modules/orders/entities/order.entity';
import { GokwikPaymentDetailsDto } from '../dto/gokwik-create-order.dto';
import { buildGokwikFinancialSnapshot } from './gokwik-financial-snapshot.util';

function makeOrder(partial: Partial<OrderEntity>): OrderEntity {
  return {
    subtotal: '100.00',
    discountAmount: '0.00',
    prepaidDiscount: '0.00',
    shippingAmount: '75.00',
    handlingAmount: '0.00',
    platformFee: '0.00',
    codCharge: '0.00',
    grandTotal: '175.00',
    couponCode: null,
    couponTitle: null,
    ...partial,
  } as OrderEntity;
}

function makePayment(
  partial: Partial<GokwikPaymentDetailsDto> = {},
): GokwikPaymentDetailsDto {
  return {
    payment_method: 'prepaid',
    payment_amount: 175,
    payment_instrument: 'upi',
    ...partial,
  };
}

describe('buildGokwikFinancialSnapshot', () => {
  it('applies GoKwik coupon discount and sets grandTotal from payment_amount', () => {
    const snapshot = buildGokwikFinancialSnapshot({
      order: makeOrder({}),
      payment: makePayment({ payment_amount: 155 }),
      meta: {
        discounts: [
          {
            amount: 20,
            type: 'Coupon Discount',
            code: 'GOKWIK20',
            description: 'GoKwik promo',
          },
        ],
      },
    });

    expect(snapshot.discountAmount).toBe(20);
    expect(snapshot.prepaidDiscount).toBe(0);
    expect(snapshot.grandTotal).toBe(155);
    expect(snapshot.shippingAmount).toBe(75);
    expect(snapshot.couponCode).toBe('GOKWIK20');
    expect(snapshot.couponTitle).toBe('GoKwik promo');
  });

  it('splits prepaid discount from coupon discount', () => {
    const snapshot = buildGokwikFinancialSnapshot({
      order: makeOrder({}),
      payment: makePayment({ payment_amount: 145 }),
      meta: {
        discounts: [
          { amount: 20, type: 'Coupon Discount', code: 'SAVE20' },
          { amount: 10, type: 'Prepaid Discount', description: 'Prepaid Discount' },
        ],
      },
    });

    expect(snapshot.discountAmount).toBe(20);
    expect(snapshot.prepaidDiscount).toBe(10);
    expect(snapshot.grandTotal).toBe(145);
    expect(snapshot.shippingAmount).toBe(75);
  });

  it('maps COD other_charges onto codCharge', () => {
    const snapshot = buildGokwikFinancialSnapshot({
      order: makeOrder({ shippingAmount: '40.00', grandTotal: '150.00' }),
      payment: makePayment({ payment_method: 'cod', payment_amount: 150 }),
      meta: {
        other_charges: [{ amount: 10, charge_type: 'cod_fees', label: 'COD Charge' }],
      },
    });

    expect(snapshot.codCharge).toBe(10);
    expect(snapshot.grandTotal).toBe(150);
    expect(snapshot.shippingAmount).toBe(40);
  });
});
