import { BadRequestException } from '@nestjs/common';
import { SubscriptionPaymentLinkService } from './subscription-payment-link.service';

describe('SubscriptionPaymentLinkService preferred gateway', () => {
  const gatewayResolver = { getActiveGateway: jest.fn() };
  const razorpayService = {
    createOrder: jest.fn(),
    getKeyId: jest.fn(() => 'rzp_test'),
    verifyPaymentSignature: jest.fn(),
    fetchOrderPayments: jest.fn(),
  };
  const cashfreeService = {
    createOrder: jest.fn(),
    getEnv: jest.fn(() => 'sandbox'),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'CASHFREE_ENV') return 'sandbox';
      return undefined;
    }),
  };

  const service = new SubscriptionPaymentLinkService(
    gatewayResolver as never,
    razorpayService as never,
    cashfreeService as never,
    configService as never,
  );

  const baseInput = {
    amount: '199.00',
    referenceId: 'spay-renew-1',
    customer: { id: 'user-1', phone: '9999999999', email: 'a@example.com', name: 'A' },
    notes: { subscriptionId: 'sub-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    razorpayService.createOrder.mockResolvedValue({
      id: 'order_rzp',
      amount: 19900,
      currency: 'INR',
    });
    cashfreeService.createOrder.mockResolvedValue({
      order_id: 'order_cf',
      payment_session_id: 'session_cf',
    });
    cashfreeService.getEnv.mockReturnValue('sandbox');
  });

  it('uses Cashfree hosted checkout query URLs in production', async () => {
    cashfreeService.getEnv.mockReturnValue('production');
    const result = await service.createPaymentLink({
      ...baseInput,
      preferredGateway: 'CASHFREE',
    });
    expect(result.paymentLink).toBe(
      'https://payments.cashfree.com/pg/view/checkout?payment_session_id=session_cf',
    );
  });

  it('creates a Cashfree session when preferredGateway is CASHFREE even if admin is Razorpay', async () => {
    gatewayResolver.getActiveGateway.mockResolvedValue('razorpay');
    const result = await service.createPaymentLink({
      ...baseInput,
      preferredGateway: 'CASHFREE',
    });
    expect(gatewayResolver.getActiveGateway).not.toHaveBeenCalled();
    expect(cashfreeService.createOrder).toHaveBeenCalled();
    expect(razorpayService.createOrder).not.toHaveBeenCalled();
    expect(result.paymentGateway).toBe('CASHFREE');
  });

  it('creates a Razorpay order when preferredGateway is RAZORPAY even if admin is Cashfree', async () => {
    gatewayResolver.getActiveGateway.mockResolvedValue('cashfree');
    const result = await service.createPaymentLink({
      ...baseInput,
      preferredGateway: 'RAZORPAY',
    });
    expect(gatewayResolver.getActiveGateway).not.toHaveBeenCalled();
    expect(razorpayService.createOrder).toHaveBeenCalled();
    expect(cashfreeService.createOrder).not.toHaveBeenCalled();
    expect(result.paymentGateway).toBe('RAZORPAY');
  });

  it('falls back to the admin active gateway when preferredGateway is unset', async () => {
    gatewayResolver.getActiveGateway.mockResolvedValue('cashfree');
    await service.createPaymentLink(baseInput);
    expect(gatewayResolver.getActiveGateway).toHaveBeenCalled();
    expect(cashfreeService.createOrder).toHaveBeenCalled();
  });

  it('rejects a zero amount', async () => {
    await expect(
      service.createPaymentLink({ ...baseInput, amount: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
