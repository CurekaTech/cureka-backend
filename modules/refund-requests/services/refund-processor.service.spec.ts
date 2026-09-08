import { BadRequestException } from '@nestjs/common';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundProcessorService } from './refund-processor.service';

describe('RefundProcessorService', () => {
  const gokwikWebhookService = { initiateRefund: jest.fn() };
  const gokwikRepository = { findRefundByRefundId: jest.fn() };
  const razorpayService = { createRefund: jest.fn(), fetchRefund: jest.fn() };
  const cashfreeService = { createRefund: jest.fn(), getRefund: jest.fn() };
  const paymentRequestsRepository = { findById: jest.fn() };

  const service = new RefundProcessorService(
    gokwikWebhookService as never,
    gokwikRepository as never,
    razorpayService as never,
    cashfreeService as never,
    paymentRequestsRepository as never,
  );

  const request = {
    refId: 'RFN1',
    orderNumber: 'ORD1',
    merchantRefundReference: 'RFNRFN1',
    providerPaymentId: 'pay_razor',
    paymentRequestId: 'pr-1',
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('routes GoKwik payments to GoKwik refund', async () => {
    gokwikWebhookService.initiateRefund.mockResolvedValue('gk_refund_1');
    const result = await service.initiate(
      { ...request, paymentProvider: RefundPaymentProvider.GOKWIK } as never,
      { id: 'order-1' } as never,
      100,
      'test',
    );
    expect(gokwikWebhookService.initiateRefund).toHaveBeenCalledWith('order-1', 100, 'test');
    expect(razorpayService.createRefund).not.toHaveBeenCalled();
    expect(cashfreeService.createRefund).not.toHaveBeenCalled();
    expect(result.providerRefundId).toBe('gk_refund_1');
  });

  it('routes Razorpay native payments to Razorpay refund', async () => {
    razorpayService.createRefund.mockResolvedValue({ id: 'rfnd_1', status: 'processed' });
    const result = await service.initiate(
      { ...request, paymentProvider: RefundPaymentProvider.RAZORPAY } as never,
      { id: 'order-1' } as never,
      100,
      'test',
    );
    expect(razorpayService.createRefund).toHaveBeenCalled();
    expect(gokwikWebhookService.initiateRefund).not.toHaveBeenCalled();
    expect(result.completed).toBe(true);
  });

  it('routes Cashfree native payments to Cashfree refund', async () => {
    paymentRequestsRepository.findById.mockResolvedValue({ refId: 'PAY123' });
    cashfreeService.createRefund.mockResolvedValue({
      cf_refund_id: 'cfr_1',
      refund_status: 'SUCCESS',
    });
    const result = await service.initiate(
      { ...request, paymentProvider: RefundPaymentProvider.CASHFREE } as never,
      { id: 'order-1' } as never,
      100,
      'test',
    );
    expect(cashfreeService.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ merchantOrderId: 'PAY123' }),
    );
    expect(result.completed).toBe(true);
  });

  it('does not call a gateway for COD', async () => {
    await expect(
      service.initiate(
        { ...request, paymentProvider: RefundPaymentProvider.COD } as never,
        { id: 'order-1', paymentMethod: OrderPaymentMethod.COD } as never,
        100,
        'test',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(gokwikWebhookService.initiateRefund).not.toHaveBeenCalled();
    expect(razorpayService.createRefund).not.toHaveBeenCalled();
    expect(cashfreeService.createRefund).not.toHaveBeenCalled();
  });
});
