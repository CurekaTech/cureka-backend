import { BadRequestException, ConflictException } from '@nestjs/common';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { REFUND_NOT_APPROVED } from '../constants/refund-request.constants';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestedByType } from '../enums/refund-requested-by-type.enum';
import { RefundRequestsService } from './refund-request.service';

const actor = {
  id: 'admin-1',
  email: 'admin@cureka.com',
  role: 'admin',
  type: RefundRequestedByType.ADMIN,
};

function buildOrder() {
  return {
    id: 'order-1',
    orderNumber: 'ORD1',
    userId: 'user-1',
    paymentMethod: OrderPaymentMethod.RAZORPAY,
    paymentStatus: OrderPaymentStatus.PAID,
    grandTotal: '500.00',
    notes: 'Generated from payment request PAY1',
  };
}

describe('RefundRequestsService workflow', () => {
  const refundRequestsRepository = {
    findActiveByOrderId: jest.fn(),
    findByIdOrRefId: jest.fn(),
    findById: jest.fn(),
    findLatestByOrderId: jest.fn(),
    existsByRefId: jest.fn(),
    create: jest.fn(),
    addHistory: jest.fn(),
    updateById: jest.fn(),
    lockById: jest.fn(),
    findAllPaginated: jest.fn(),
    findByProviderRefundId: jest.fn(),
    findByMerchantRefundReference: jest.fn(),
    sumActiveAmountsForOrder: jest.fn().mockResolvedValue(0),
  };
  const amountService = {
    calculateRefundableAmount: jest.fn(),
  };
  const providerResolver = {
    resolve: jest.fn(),
  };
  const processor = {
    initiate: jest.fn(),
    reconcile: jest.fn(),
  };
  const auditService = { log: jest.fn() };
  const eventEmitter = { emitAsync: jest.fn() };
  const dataSource = {
    transaction: jest.fn(async (fn: (manager: unknown) => Promise<unknown>) => fn({})),
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue(buildOrder()),
    }),
  };

  const service = new RefundRequestsService(
    dataSource as never,
    refundRequestsRepository as never,
    amountService as never,
    providerResolver as never,
    processor as never,
    auditService as never,
    eventEmitter as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue(buildOrder()),
    });
    amountService.calculateRefundableAmount.mockResolvedValue({
      capturedAmount: '500.00',
      alreadyRefundedAmount: '0.00',
      pendingRefundAmount: '0.00',
      refundableAmount: '500.00',
      currency: 'INR',
      requiresOnlineRefund: true,
    });
    providerResolver.resolve.mockResolvedValue({
      paymentProvider: 'RAZORPAY',
      originalPaymentMethod: 'RAZORPAY',
      providerPaymentId: 'pay_1',
      paymentRequestId: 'pr-1',
      capturedAmount: '500.00',
      identifiable: true,
    });
    refundRequestsRepository.existsByRefId.mockResolvedValue(false);
    refundRequestsRepository.create.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'rr-1',
      refId: 'RFN1',
      history: [],
      customer: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
    }));
  });

  it('creates a refund request on cancellation and does not call a provider', async () => {
    refundRequestsRepository.findActiveByOrderId.mockResolvedValue(null);
    const created = await service.createFromOrderCancellation(
      buildOrder() as never,
      actor,
      'Customer cancelled',
    );
    expect(created?.status).toBe(RefundRequestStatus.REQUESTED);
    expect(processor.initiate).not.toHaveBeenCalled();
  });

  it('does not create a duplicate refund request', async () => {
    refundRequestsRepository.findActiveByOrderId.mockResolvedValue({ id: 'rr-1' });
    const created = await service.createFromOrderCancellation(
      buildOrder() as never,
      actor,
      'Customer cancelled',
    );
    expect(created?.id).toBe('rr-1');
    expect(refundRequestsRepository.create).not.toHaveBeenCalled();
  });

  it('does not create a request for COD without captured online payment', async () => {
    refundRequestsRepository.findActiveByOrderId.mockResolvedValue(null);
    amountService.calculateRefundableAmount.mockResolvedValue({
      capturedAmount: '0.00',
      alreadyRefundedAmount: '0.00',
      pendingRefundAmount: '0.00',
      refundableAmount: '0.00',
      currency: 'INR',
      requiresOnlineRefund: false,
    });
    const created = await service.createFromOrderCancellation(
      { ...buildOrder(), paymentMethod: OrderPaymentMethod.COD } as never,
      actor,
      'Customer cancelled',
    );
    expect(created).toBeNull();
    expect(processor.initiate).not.toHaveBeenCalled();
  });

  it('rejects unapproved initiation', async () => {
    refundRequestsRepository.findByIdOrRefId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REQUESTED,
    });
    refundRequestsRepository.lockById.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REQUESTED,
      approvedAmount: '500.00',
      requestedAmount: '500.00',
      orderId: 'order-1',
      paymentProvider: 'RAZORPAY',
    });
    await expect(service.initiate('rr-1', {}, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(processor.initiate).not.toHaveBeenCalled();
  });

  it('rejects initiation of a rejected request', async () => {
    refundRequestsRepository.findByIdOrRefId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REJECTED,
    });
    refundRequestsRepository.lockById.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REJECTED,
      orderId: 'order-1',
    });
    await expect(service.initiate('rr-1', {}, actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: REFUND_NOT_APPROVED }),
    });
  });

  it('returns an idempotent conflict when already initiated', async () => {
    refundRequestsRepository.findByIdOrRefId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.PROCESSING,
    });
    refundRequestsRepository.lockById.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.PROCESSING,
      providerRefundId: 'rfnd_1',
      orderId: 'order-1',
    });
    await expect(service.initiate('rr-1', {}, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(processor.initiate).not.toHaveBeenCalled();
  });

  it('requires a rejection reason', async () => {
    refundRequestsRepository.findByIdOrRefId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REQUESTED,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    refundRequestsRepository.lockById.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REQUESTED,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    refundRequestsRepository.findById.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.REJECTED,
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      orderId: 'order-1',
      customer: null,
    });
    await service.reject('rr-1', { reason: 'Delivered successfully' }, actor);
    expect(refundRequestsRepository.updateById).toHaveBeenCalled();
  });

  it('hides internal comments from the customer view', async () => {
    refundRequestsRepository.findLatestByOrderId.mockResolvedValue({
      id: 'rr-1',
      refId: 'RFN1',
      status: RefundRequestStatus.REQUESTED,
      requestedAmount: '500.00',
      approvedAmount: null,
      currency: 'INR',
      createdAt: new Date('2026-09-08T10:00:00.000Z'),
      processedAt: null,
      history: [{ comment: 'internal note' }],
    });
    const view = await service.getCustomerRefund('order-1', 'user-1');
    expect(view?.message).toContain('5–7 working days');
    expect(JSON.stringify(view)).not.toContain('internal note');
  });

  it('does not let a customer read another customer refund', async () => {
    dataSource.getRepository.mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ ...buildOrder(), userId: 'other-user' }),
    });
    await expect(service.getCustomerRefund('order-1', 'user-1')).rejects.toBeInstanceOf(Error);
  });

  it('ignores duplicate provider webhooks with the same status', async () => {
    refundRequestsRepository.findByProviderRefundId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.PROCESSING,
      providerRefundId: 'rfnd_1',
      providerRefundStatus: 'processed',
    });
    await service.applyProviderWebhook({
      provider: 'RAZORPAY' as never,
      providerRefundId: 'rfnd_1',
      providerStatus: 'processed',
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('does not move a processed refund backward', async () => {
    refundRequestsRepository.findByProviderRefundId.mockResolvedValue({
      id: 'rr-1',
      status: RefundRequestStatus.PROCESSED,
      providerRefundId: 'rfnd_1',
      providerRefundStatus: 'processed',
    });
    await service.applyProviderWebhook({
      provider: 'RAZORPAY' as never,
      providerRefundId: 'rfnd_1',
      providerStatus: 'failed',
    });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('paginates admin list results from the repository total', async () => {
    refundRequestsRepository.findAllPaginated.mockResolvedValue({
      data: [
        {
          id: 'rr-1',
          refId: 'RFN1',
          orderId: 'order-1',
          orderNumber: 'ORD1',
          customerId: 'user-1',
          customer: { firstName: 'A', lastName: 'B', email: 'a@b.com', mobileNumber: '999' },
          reason: 'CUSTOMER_CANCELLATION',
          requestedAmount: '500.00',
          approvedAmount: null,
          currency: 'INR',
          status: RefundRequestStatus.REQUESTED,
          originalPaymentMethod: 'RAZORPAY',
          paymentProvider: 'RAZORPAY',
          providerRefundId: null,
          requestedByType: RefundRequestedByType.CUSTOMER,
          assignedToUserId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          expectedCreditFrom: null,
          expectedCreditTo: null,
        },
      ],
      total: 41,
    });
    const result = await service.list({ page: 1, limit: 20, status: RefundRequestStatus.REQUESTED });
    expect(result.total).toBe(41);
    expect(result.data).toHaveLength(1);
    expect(refundRequestsRepository.findAllPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ status: RefundRequestStatus.REQUESTED }),
    );
  });
});
