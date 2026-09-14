import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { CodRefundMethod } from '../enums/cod-refund-method.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { allocateReturnRefundFunds } from './cod-refund-allocation.util';

describe('allocateReturnRefundFunds', () => {
  it('sends a full COD return to the COD component', () => {
    const result = allocateReturnRefundFunds({
      paymentMethod: OrderPaymentMethod.COD,
      refundAmount: '150.00',
      orderGrandTotal: '500.00',
      codRefundMethod: CodRefundMethod.BANK_ACCOUNT,
    });
    expect(result.codAmount).toBe('150.00');
    expect(result.onlineAmount).toBe('0.00');
    expect(result.originalWalletAmount).toBe('0.00');
    expect(result.codRefundMethod).toBe(CodRefundMethod.BANK_ACCOUNT);
  });

  it('credits an original wallet-paid order back to the wallet', () => {
    const result = allocateReturnRefundFunds({
      paymentMethod: OrderPaymentMethod.WALLET,
      refundAmount: '80.00',
      orderGrandTotal: '80.00',
    });
    expect(result.originalWalletAmount).toBe('80.00');
    expect(result.codAmount).toBe('0.00');
    expect(result.onlineAmount).toBe('0.00');
  });

  it('splits GoKwik partial COD across prepaid and cash-on-delivery', () => {
    const result = allocateReturnRefundFunds({
      paymentMethod: OrderPaymentMethod.GOKWIK_PARTIAL_COD,
      refundAmount: '100.00',
      orderGrandTotal: '200.00',
      prepaidAmount: '80.00',
      payableOnDelivery: '120.00',
    });
    expect(result.onlineAmount).toBe('40.00');
    expect(result.codAmount).toBe('60.00');
    expect(result.onlineProvider).toBe(RefundPaymentProvider.GOKWIK);
  });

  it('returns prepaid-only orders to the original gateway', () => {
    const result = allocateReturnRefundFunds({
      paymentMethod: OrderPaymentMethod.RAZORPAY,
      refundAmount: '99.00',
      orderGrandTotal: '99.00',
    });
    expect(result.onlineAmount).toBe('99.00');
    expect(result.codAmount).toBe('0.00');
    expect(result.onlineProvider).toBe(RefundPaymentProvider.RAZORPAY);
  });
});
