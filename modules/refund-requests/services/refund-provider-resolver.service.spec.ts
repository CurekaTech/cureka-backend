import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundProviderResolverService } from './refund-provider-resolver.service';

describe('RefundProviderResolverService', () => {
  const gokwikRepository = {
    findOrderByOrderId: jest.fn(),
  };
  const paymentRequestsRepository = {
    findPaidByRefId: jest.fn(),
    findPaidByPaymentReference: jest.fn(),
    findLatestPaidForCustomerAmount: jest.fn(),
  };
  const service = new RefundProviderResolverService(
    gokwikRepository as never,
    paymentRequestsRepository as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('uses GoKwik for linked GoKwik orders including partial COD prepaid amount', async () => {
    gokwikRepository.findOrderByOrderId.mockResolvedValue({
      paymentId: 'pay_gk',
      prepaidAmount: '199.00',
      paymentAmount: '599.00',
    });
    const result = await service.resolve({
      id: 'order-1',
      paymentMethod: OrderPaymentMethod.GOKWIK_PARTIAL_COD,
      paymentStatus: OrderPaymentStatus.PARTIALLY_PAID,
      grandTotal: '599.00',
      notes: null,
      orderNumber: 'ORD1',
      userId: 'user-1',
    } as never);
    expect(result.paymentProvider).toBe(RefundPaymentProvider.GOKWIK);
    expect(result.capturedAmount).toBe('199.00');
    expect(result.providerPaymentId).toBe('pay_gk');
  });

  it('does not send COD without captured online payment to a gateway', async () => {
    gokwikRepository.findOrderByOrderId.mockResolvedValue(null);
    const result = await service.resolve({
      id: 'order-2',
      paymentMethod: OrderPaymentMethod.COD,
      paymentStatus: OrderPaymentStatus.PENDING,
      grandTotal: '500.00',
      notes: null,
      orderNumber: 'ORD2',
      userId: 'user-1',
    } as never);
    expect(result.paymentProvider).toBe(RefundPaymentProvider.COD);
    expect(result.capturedAmount).toBe('0.00');
  });

  it('uses Razorpay from the paid payment request, not a frontend value', async () => {
    gokwikRepository.findOrderByOrderId.mockResolvedValue(null);
    paymentRequestsRepository.findPaidByRefId.mockResolvedValue({
      id: 'pr-1',
      paymentProvider: 'RAZORPAY',
      paymentReference: 'pay_razor',
      status: 'PAID',
      totalAmount: '1299.00',
    });
    const result = await service.resolve({
      id: 'order-3',
      paymentMethod: OrderPaymentMethod.RAZORPAY,
      paymentStatus: OrderPaymentStatus.PAID,
      grandTotal: '1299.00',
      notes: 'Generated from payment request PAY2026123456',
      orderNumber: 'ORD3',
      userId: 'user-1',
    } as never);
    expect(result.paymentProvider).toBe(RefundPaymentProvider.RAZORPAY);
    expect(result.providerPaymentId).toBe('pay_razor');
  });

  it('uses Cashfree from the paid payment request', async () => {
    gokwikRepository.findOrderByOrderId.mockResolvedValue(null);
    paymentRequestsRepository.findPaidByRefId.mockResolvedValue(null);
    paymentRequestsRepository.findPaidByPaymentReference.mockResolvedValue(null);
    paymentRequestsRepository.findLatestPaidForCustomerAmount.mockResolvedValue({
      id: 'pr-cf',
      paymentProvider: 'CASHFREE',
      paymentReference: 'cf_pay_1',
      status: 'PAID',
      totalAmount: '800.00',
    });
    const result = await service.resolve({
      id: 'order-4',
      paymentMethod: OrderPaymentMethod.CASHFREE,
      paymentStatus: OrderPaymentStatus.PAID,
      grandTotal: '800.00',
      notes: null,
      orderNumber: 'ORD4',
      userId: 'user-1',
    } as never);
    expect(result.paymentProvider).toBe(RefundPaymentProvider.CASHFREE);
  });
});
