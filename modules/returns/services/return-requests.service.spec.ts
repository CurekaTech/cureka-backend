import { ReasonMasterEntity } from '@modules/master/entities/reason-master.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ReasonPickupMode } from '@modules/master/enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { ReasonMastersRepository } from '@modules/master/repositories/reason-masters.repository';
import { AuditService } from '@modules/master/services/audit.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS } from '@packages/events';
import { DataSource, Repository } from 'typeorm';
import { CreateReturnRequestDto } from '../dto/return-request.dto';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { IOrderReturnEligibility } from '../interfaces/return-eligibility.interface';
import { ReturnActor } from '../interfaces/return-request.interface';
import { ReturnEvidencesRepository } from '../repositories/return-evidences.repository';
import { ReturnPickupsRepository } from '../repositories/return-pickups.repository';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { ReturnAmountService } from './return-amount.service';
import { ReturnEligibilityService } from './return-eligibility.service';
import { ReturnRequestsService } from './return-requests.service';

const CUSTOMER_ID = 'user-1';

const reason = (overrides: Partial<ReasonMasterEntity> = {}): ReasonMasterEntity =>
  ({
    id: 'reason-1',
    refId: 'REA00000001',
    code: 'DAMAGED_ON_ARRIVAL',
    title: 'Damaged on arrival',
    description: 'Item arrived damaged',
    internalDescription: 'Check packaging photos before approving',
    workflows: [ReasonWorkflow.RETURN],
    status: MasterStatus.ACTIVE,
    commentsRequired: false,
    imagesRequired: false,
    videoRequired: false,
    minImages: 0,
    maxImages: 5,
    minVideos: 0,
    maxVideos: 1,
    qcRequired: true,
    pickupMode: ReasonPickupMode.PICKUP_REQUIRED,
    isCustomerVisible: true,
    ...overrides,
  }) as ReasonMasterEntity;

const order = (overrides: Partial<OrderEntity> = {}): OrderEntity =>
  ({
    id: 'order-1',
    orderNumber: 'CUR2026000001',
    userId: CUSTOMER_ID,
    orderStatus: OrderStatus.DELIVERED,
    deliveredAt: new Date('2026-01-10T00:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        productName: 'Vitamin C Serum',
        variantName: '30ml',
        quantity: 2,
        unitPrice: '500.00',
        totalPrice: '1000.00',
      },
    ],
    ...overrides,
  }) as OrderEntity;

const eligibility = (
  overrides: Partial<IOrderReturnEligibility['items'][number]> = {},
): IOrderReturnEligibility =>
  ({
    orderId: 'order-1',
    orderNumber: 'CUR2026000001',
    orderStatus: OrderStatus.DELIVERED,
    isRto: false,
    hasEligibleItems: true,
    items: [
      {
        orderItemId: 'item-1',
        productId: 'product-1',
        variantId: 'variant-1',
        sku: 'SKU-1',
        orderedQuantity: 2,
        committedQuantity: 0,
        availableQuantity: 2,
        canReturn: true,
        canReplace: false,
        canRequestRefund: true,
        allowedResolutions: [ReturnResolution.REFUND],
        ineligibilityCode: null,
        ineligibilityMessage: null,
        deliveredAt: new Date('2026-01-10T00:00:00.000Z'),
        returnWindowExpiresAt: new Date('2026-01-17T00:00:00.000Z'),
        replacementWindowExpiresAt: null,
        policy: { pickupRequired: true, qcRequired: true },
        ...overrides,
      },
    ],
  }) as unknown as IOrderReturnEligibility;

const dto = (overrides: Partial<CreateReturnRequestDto> = {}): CreateReturnRequestDto =>
  ({
    orderId: 'order-1',
    reasonId: 'reason-1',
    resolution: ReturnResolution.REFUND,
    items: [{ orderItemId: 'item-1', quantity: 1 }],
    conditionDeclarations: { unused: true, originalPackaging: true },
    ...overrides,
  }) as CreateReturnRequestDto;

const actor: ReturnActor = {
  id: CUSTOMER_ID,
  type: ReturnRequestedByType.CUSTOMER,
};

describe('ReturnRequestsService.createForCustomer', () => {
  let service: ReturnRequestsService;
  let returnRequestsRepository: jest.Mocked<Record<string, jest.Mock>>;
  let evidencesRepository: jest.Mocked<Record<string, jest.Mock>>;
  let eligibilityService: jest.Mocked<Record<string, jest.Mock>>;
  let amountService: jest.Mocked<Record<string, jest.Mock>>;
  let reasonMastersRepository: jest.Mocked<Record<string, jest.Mock>>;
  let auditService: jest.Mocked<Record<string, jest.Mock>>;
  let eventEmitter: jest.Mocked<Record<string, jest.Mock>>;
  let ordersRepository: jest.Mocked<Record<string, jest.Mock>>;
  let committedQuantities: Map<string, number>;

  beforeEach(() => {
    committedQuantities = new Map<string, number>();

    returnRequestsRepository = {
      existsByRefId: jest.fn().mockResolvedValue(false),
      existsByItemRefId: jest.fn().mockResolvedValue(false),
      existsByReturnNumber: jest.fn().mockResolvedValue(false),
      sumCommittedQuantityByOrderItem: jest.fn(async () => committedQuantities),
      create: jest.fn(async (payload) => ({ ...payload, id: 'return-1' })),
      createItems: jest.fn().mockResolvedValue(undefined),
      addHistory: jest.fn().mockResolvedValue(undefined),
    };
    evidencesRepository = {
      existsByRefId: jest.fn().mockResolvedValue(false),
      createMany: jest.fn().mockResolvedValue(undefined),
    };
    eligibilityService = { evaluateOrder: jest.fn(async () => eligibility()) };
    amountService = {
      calculate: jest.fn(async () => ({
        refundableAmount: '500.00',
        items: [{ orderItemId: 'item-1', netAmount: '500.00' }],
      })),
    };
    reasonMastersRepository = { findByIdOrRefId: jest.fn(async () => reason()) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) };
    ordersRepository = { findOne: jest.fn(async () => order()) };

    const lockQueryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(order()),
    };
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => lockQueryBuilder),
      })),
    };
    const dataSource = {
      transaction: jest.fn(async (runInTransaction: (m: unknown) => Promise<unknown>) =>
        runInTransaction(manager),
      ),
    };

    service = new ReturnRequestsService(
      dataSource as unknown as DataSource,
      returnRequestsRepository as unknown as ReturnRequestsRepository,
      evidencesRepository as unknown as ReturnEvidencesRepository,
      {} as unknown as ReturnPickupsRepository,
      eligibilityService as unknown as ReturnEligibilityService,
      amountService as unknown as ReturnAmountService,
      reasonMastersRepository as unknown as ReasonMastersRepository,
      auditService as unknown as AuditService,
      { persist: jest.fn((path: string) => ({ key: path, name: path })) } as unknown as StorageUrlEnricher,
      eventEmitter as unknown as EventEmitter2,
      ordersRepository as unknown as Repository<OrderEntity>,
      { get: jest.fn().mockReturnValue(true) } as never,
      { cancel: jest.fn().mockResolvedValue(undefined) } as never,
    );
  });

  it('creates the return in REQUESTED and never promises a refund', async () => {
    const result = await service.createForCustomer(dto(), actor);

    expect(result.status).toBe(ReturnStatus.REQUESTED);
    expect(result.returnNumber).toMatch(/^RTN/);
    expect(result.message.toLowerCase()).not.toContain('refunded');
    expect(returnRequestsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: ReturnStatus.REQUESTED }),
      expect.anything(),
    );
  });

  it('does not link, create or initiate any refund on submission', async () => {
    await service.createForCustomer(dto(), actor);

    const created = returnRequestsRepository.create.mock.calls[0][0];
    expect(created.refundRequestId).toBeUndefined();
    expect(created.approvedRefundAmount).toBeUndefined();
    expect(created.estimatedRefundAmount).toBe('500.00');
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      EVENTS.RETURN_REQUEST_CREATED,
      expect.anything(),
    );
    expect(eventEmitter.emitAsync).not.toHaveBeenCalledWith(
      EVENTS.REFUND_PROCESSED,
      expect.anything(),
    );
  });

  it('refuses a return on somebody else\u2019s order', async () => {
    await expect(
      service.createForCustomer(dto(), { ...actor, id: 'someone-else' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a quantity larger than what is still available', async () => {
    eligibilityService.evaluateOrder.mockResolvedValue(
      eligibility({ availableQuantity: 1, committedQuantity: 1 }),
    );

    await expect(
      service.createForCustomer(dto({ items: [{ orderItemId: 'item-1', quantity: 2 }] }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(returnRequestsRepository.create).not.toHaveBeenCalled();
  });

  it('rejects an ineligible item using the eligibility code', async () => {
    eligibilityService.evaluateOrder.mockResolvedValue(
      eligibility({
        canReturn: false,
        allowedResolutions: [],
        ineligibilityCode: 'RETURN_WINDOW_EXPIRED',
        ineligibilityMessage: 'The return window for this item has closed.',
      }),
    );

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'RETURN_WINDOW_EXPIRED' },
    });
  });

  it('rejects a resolution the item does not offer', async () => {
    eligibilityService.evaluateOrder.mockResolvedValue(
      eligibility({ allowedResolutions: [ReturnResolution.REPLACEMENT] }),
    );

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'RETURN_RESOLUTION_NOT_ALLOWED' },
    });
  });

  it('re-checks the quantity ledger inside the locked transaction', async () => {
    // Eligibility was computed before a competing return committed the line.
    committedQuantities = new Map([['item-1', 2]]);

    await expect(service.createForCustomer(dto(), actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires comments when the reason demands them', async () => {
    reasonMastersRepository.findByIdOrRefId.mockResolvedValue(reason({ commentsRequired: true }));

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'RETURN_COMMENTS_REQUIRED' },
    });
  });

  it('requires evidence when the reason demands images', async () => {
    reasonMastersRepository.findByIdOrRefId.mockResolvedValue(
      reason({ imagesRequired: true, minImages: 2 }),
    );

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'EVIDENCE_REQUIRED' },
    });
  });

  it('rejects a reason that does not belong to the return workflow', async () => {
    reasonMastersRepository.findByIdOrRefId.mockResolvedValue(
      reason({ workflows: [ReasonWorkflow.REPLACEMENT] }),
    );

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'INVALID_RETURN_REASON' },
    });
  });

  it('hides admin-only reasons from customers', async () => {
    reasonMastersRepository.findByIdOrRefId.mockResolvedValue(reason({ isCustomerVisible: false }));

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'INVALID_RETURN_REASON' },
    });
  });

  it('requires a COD refund method on a cash-on-delivery order', async () => {
    ordersRepository.findOne.mockResolvedValue(
      order({ paymentMethod: OrderPaymentMethod.COD }),
    );

    await expect(service.createForCustomer(dto(), actor)).rejects.toMatchObject({
      response: { code: 'COD_REFUND_METHOD_REQUIRED' },
    });
  });

  it('rejects mismatched COD bank account numbers', async () => {
    process.env['BANK_ACCOUNT_ENCRYPTION_KEY'] = 'b'.repeat(64);
    ordersRepository.findOne.mockResolvedValue(
      order({ paymentMethod: OrderPaymentMethod.COD }),
    );

    await expect(
      service.createForCustomer(
        dto({
          refundMethod: CodRefundMethod.BANK_ACCOUNT,
          bankDetails: {
            accountHolderName: 'Test User',
            accountNumber: '123456789012',
            confirmAccountNumber: '123456789099',
            ifsc: 'HDFC0001234',
          },
        }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: { code: 'BANK_ACCOUNT_MISMATCH' },
    });
    expect(returnRequestsRepository.create).not.toHaveBeenCalled();
  });
});
