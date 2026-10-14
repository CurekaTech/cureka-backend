import { AuditService } from '@modules/master/services/audit.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { PaymentRequestsService } from '@modules/payment-requests/services/payment-requests.service';
import { RefundRequestsRepository } from '@modules/refund-requests/repositories/refund-requests.repository';
import { RefundRequestsService } from '@modules/refund-requests/services/refund-request.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { ReturnHistoryAction } from '../enums/return-history-action.enum';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnRequestEntity } from '../entities/return-request.entity';
import { ReturnActor } from '../interfaces/return-request.interface';
import { ReturnEvidencesRepository } from '../repositories/return-evidences.repository';
import { ReturnPickupsRepository } from '../repositories/return-pickups.repository';
import { ReturnQcRecordsRepository } from '../repositories/return-qc-records.repository';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { ReturnPickupService } from './return-pickup.service';
import { ReturnWorkflowService } from './return-workflow.service';

const actor: ReturnActor = {
  id: 'admin-1',
  email: 'admin@cureka.com',
  role: 'ADMIN',
  type: ReturnRequestedByType.ADMIN,
};

const returnRequest = (overrides: Partial<ReturnRequestEntity> = {}): ReturnRequestEntity =>
  ({
    id: 'return-1',
    refId: 'RET1',
    returnNumber: 'RTN1',
    orderId: 'order-1',
    orderNumber: 'CU1',
    customerId: 'user-1',
    status: ReturnStatus.REPLACEMENT_PENDING,
    resolution: ReturnResolution.REPLACEMENT,
    reasonCode: 'DAMAGED',
    reasonTitle: 'Damaged',
    estimatedRefundAmount: '0.00',
    approvedRefundAmount: null,
    currency: 'INR',
    pickupRequired: false,
    qcRequired: false,
    isAdminInitiated: false,
    assignedToUserId: null,
    deliveredAt: new Date('2026-01-10T00:00:00.000Z'),
    returnWindowExpiresAt: new Date('2026-01-12T00:00:00.000Z'),
    createdAt: new Date('2026-01-11T00:00:00.000Z'),
    updatedAt: new Date('2026-01-11T00:00:00.000Z'),
    replacementPaymentRequestId: null,
    replacementSettlement: null,
    refundRequestId: null,
    history: [],
    items: [
      {
        id: 'line-1',
        quantity: 1,
        unitPrice: '100.00',
        sku: 'A-30',
        productId: 'product-a',
        variantId: 'variant-30',
        preferredReplacementVariantId: 'variant-30',
        preferredReplacementSku: 'A-30',
        replacementVariantId: 'variant-30',
        replacementSku: null,
      },
    ],
    ...overrides,
  }) as ReturnRequestEntity;

describe('ReturnWorkflowService replacement confirmation', () => {
  let service: ReturnWorkflowService;
  let returnRequestsRepository: jest.Mocked<Record<string, jest.Mock>>;
  let variantsRepository: jest.Mocked<Record<string, jest.Mock>>;
  let paymentRequestsService: jest.Mocked<Record<string, jest.Mock>>;
  let current: ReturnRequestEntity;

  beforeEach(() => {
    current = returnRequest();
    returnRequestsRepository = {
      findByAnyIdentifier: jest.fn(async () => current),
      lockById: jest.fn(async () => current),
      updateById: jest.fn(async (_id, patch) => {
        current = { ...current, ...patch };
      }),
      updateItemById: jest.fn().mockResolvedValue(undefined),
      addHistory: jest.fn().mockResolvedValue(undefined),
    };
    variantsRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'variant-60',
        sku: 'A-60',
        displayName: '60 tablets',
        sellingPrice: '150.00',
        product: { name: 'Product A' },
      }),
    };
    paymentRequestsService = {
      findById: jest.fn().mockResolvedValue(null),
      createReplacementDifferenceLink: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn(async (run: (manager: object) => Promise<void>) => run({})),
    };

    service = new ReturnWorkflowService(
      dataSource as unknown as DataSource,
      returnRequestsRepository as unknown as ReturnRequestsRepository,
      { findByReturnRequestId: jest.fn().mockResolvedValue([]) } as unknown as ReturnEvidencesRepository,
      { findByReturnRequestId: jest.fn().mockResolvedValue([]) } as unknown as ReturnPickupsRepository,
      { findByReturnRequestId: jest.fn().mockResolvedValue([]) } as unknown as ReturnQcRecordsRepository,
      {} as ReturnPickupService,
      paymentRequestsService as unknown as PaymentRequestsService,
      {} as RefundRequestsService,
      {} as RefundRequestsRepository,
      { log: jest.fn() } as unknown as AuditService,
      { enrichDeep: jest.fn(async (value) => value) } as unknown as StorageUrlEnricher,
      { get: jest.fn() } as unknown as ConfigService,
      { emitAsync: jest.fn() } as unknown as EventEmitter2,
      {} as Repository<OrderEntity>,
      variantsRepository as unknown as Repository<ProductVariantEntity>,
    );
  });

  it('freezes the higher price and keeps the customer preference', async () => {
    await service.confirmReplacementSelection(
      'return-1',
      { replacementVariantId: 'variant-60', comment: 'Customer asked for the larger pack' },
      actor,
    );

    expect(returnRequestsRepository.updateById).toHaveBeenCalledWith(
      'return-1',
      expect.objectContaining({
        replacementOriginalAmount: '100.00',
        replacementQuoteAmount: '150.00',
        replacementDifferenceAmount: '50.00',
        replacementSettlement: 'COLLECT',
      }),
      expect.anything(),
    );
    expect(returnRequestsRepository.updateItemById).toHaveBeenCalledWith(
      'line-1',
      expect.objectContaining({
        replacementVariantId: 'variant-60',
        replacementSku: 'A-60',
        replacementProductName: 'Product A',
        replacementVariantName: '60 tablets',
      }),
      expect.anything(),
    );
    const itemPatch = returnRequestsRepository.updateItemById.mock.calls[0][1];
    expect(itemPatch.preferredReplacementVariantId).toBeUndefined();
    expect(returnRequestsRepository.addHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ReturnHistoryAction.INTERNAL_NOTE_ADDED,
        comment: 'Customer asked for the larger pack',
        isCustomerVisible: false,
        metadata: expect.objectContaining({
          confirmedReplacementVariantId: 'variant-60',
          selectionChanged: true,
        }),
      }),
      expect.anything(),
    );
  });

  it('refunds the stored difference when the confirmed price is lower', async () => {
    variantsRepository.findOne.mockResolvedValue({
      id: 'variant-15',
      sku: 'A-15',
      displayName: '15 tablets',
      sellingPrice: '80.00',
      product: { name: 'Product A' },
    });

    await service.confirmReplacementSelection('return-1', { replacementVariantId: 'variant-15' }, actor);

    expect(returnRequestsRepository.updateById).toHaveBeenCalledWith(
      'return-1',
      expect.objectContaining({
        replacementDifferenceAmount: '20.00',
        replacementSettlement: 'REFUND',
      }),
      expect.anything(),
    );
  });

  it('stores no settlement amount when the prices are equal', async () => {
    variantsRepository.findOne.mockResolvedValue({
      id: 'variant-30',
      sku: 'A-30',
      displayName: '30 tablets',
      sellingPrice: '100.00',
      product: { name: 'Product A' },
    });

    await service.confirmReplacementSelection('return-1', { replacementVariantId: 'variant-30' }, actor);

    expect(returnRequestsRepository.updateById).toHaveBeenCalledWith(
      'return-1',
      expect.objectContaining({
        replacementDifferenceAmount: '0.00',
        replacementSettlement: 'NONE',
      }),
      expect.anything(),
    );
    expect(returnRequestsRepository.addHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ selectionChanged: false }),
      }),
      expect.anything(),
    );
  });

  it('refuses to change the quote after a difference payment exists', async () => {
    current = returnRequest({ replacementPaymentRequestId: 'pay-1' });

    await expect(
      service.confirmReplacementSelection('return-1', { replacementVariantId: 'variant-60' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(returnRequestsRepository.updateItemById).not.toHaveBeenCalled();
  });

  it('does not create a second payment link when one is already stored', async () => {
    current = returnRequest({
      replacementSettlement: 'COLLECT',
      replacementDifferenceAmount: '50.00',
      replacementPaymentRequestId: 'pay-1',
    });
    paymentRequestsService.findById.mockResolvedValue({ paymentLink: 'https://pay.example/1' });

    await service.createReplacementDifferencePaymentLink('return-1', actor);

    expect(paymentRequestsService.createReplacementDifferenceLink).not.toHaveBeenCalled();
  });
});
