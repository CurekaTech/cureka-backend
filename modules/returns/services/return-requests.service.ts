import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { ReasonMasterEntity } from '@modules/master/entities/reason-master.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { ReasonPickupMode } from '@modules/master/enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { ReasonMastersRepository } from '@modules/master/repositories/reason-masters.repository';
import { AuditService } from '@modules/master/services/audit.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { toMoneyString } from '@modules/orders/utils/money.util';
import {
  BANK_DETAILS_LOCKED,
  BANK_DETAILS_NOT_APPLICABLE,
  COD_PAYOUT_RATE_LIMITED,
  COD_REFUND_METHOD_REQUIRED,
  WALLET_REFUND_NOT_ENABLED,
} from '@modules/refund-requests/constants/cod-payout.constants';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { EVENTS } from '@packages/events';
import { IStorageFileReference } from '@packages/storage';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ACTIVE_RETURN_ALREADY_EXISTS,
  EXPIRED_PRODUCT_REASON_CODE,
  EVIDENCE_REQUIRED,
  INVALID_RETURN_REASON,
  RETURN_ACCESS_DENIED,
  RETURN_CANCELLATION_NOT_ALLOWED,
  RETURN_COMMENTS_REQUIRED,
  RETURN_CONDITIONS_NOT_CONFIRMED,
  RETURN_CURRENCY,
  RETURN_EVIDENCE_LIMIT_EXCEEDED,
  RETURN_ITEM_NOT_FOUND,
  RETURN_MAX_EVIDENCE_FILES,
  RETURN_NOT_ALLOWED,
  RETURN_ORDER_NOT_FOUND,
  RETURN_OVERRIDE_JUSTIFICATION_REQUIRED,
  RETURN_QUANTITY_EXCEEDED,
  RETURN_REQUEST_NOT_FOUND,
  RETURN_RESOLUTION_NOT_ALLOWED,
  RETURN_SUBMITTED_CUSTOMER_MESSAGE,
} from '../constants/return.constants';
import {
  AdminCreateReturnRequestDto,
  CancelReturnRequestDto,
  CreateReturnRequestDto,
  ReturnPickupAddressDto,
  SubmitAdditionalInformationDto,
  SubmitReturnBankDetailsDto,
} from '../dto/return-request.dto';
import { ReturnEvidenceMediaType, ReturnEvidenceSource } from '../enums/return-evidence.enum';
import { ReturnHistoryAction } from '../enums/return-history-action.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnRequestEntity } from '../entities/return-request.entity';
import { IOrderReturnEligibility } from '../interfaces/return-eligibility.interface';
import { IReturnPickupAddress } from '../interfaces/return-pickup-address.interface';
import {
  ICustomerReturnDetail,
  IReturnRequestListItem,
  ReturnActor,
} from '../interfaces/return-request.interface';
import {
  isCustomerCancellable,
  mapCustomerReturnDetail,
  mapReturnToListItem,
} from '../mappers/return-request.mapper';
import { ReturnEvidencesRepository } from '../repositories/return-evidences.repository';
import { ReturnPickupsRepository } from '../repositories/return-pickups.repository';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { ReturnAmountService } from './return-amount.service';
import { ReturnEligibilityService } from './return-eligibility.service';
import { ReturnPickupService } from './return-pickup.service';
import { describeCodRefundDestination, orderHasCodRefundPortion } from '../utils/cod-refund-destination.util';
import { InMemoryRateLimiter } from '../utils/in-memory-rate-limiter.util';
import { requireBankDetailsForMethod } from '../utils/return-bank-details.util';

export interface IEvidenceUpload {
  path: string;
  mediaType: ReturnEvidenceMediaType;
  originalFilename?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
}

/** Customer-safe reason projection — `internalDescription` is never included. */
export interface ICustomerReturnReason {
  id: string;
  refId: string;
  code: string;
  title: string;
  description: string | null;
  commentsRequired: boolean;
  imagesRequired: boolean;
  videoRequired: boolean;
  minImages: number;
  maxImages: number;
  minVideos: number;
  maxVideos: number;
  pickupMode: ReasonPickupMode;
}

export interface ICreateReturnResult {
  returnRequestId: string;
  returnNumber: string;
  status: ReturnStatus;
  /** Deliberately not a refund confirmation — a return never auto-refunds. */
  message: string;
}

@Injectable()
export class ReturnRequestsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly returnRequestsRepository: ReturnRequestsRepository,
    private readonly evidencesRepository: ReturnEvidencesRepository,
    private readonly pickupsRepository: ReturnPickupsRepository,
    private readonly eligibilityService: ReturnEligibilityService,
    private readonly amountService: ReturnAmountService,
    private readonly reasonMastersRepository: ReasonMastersRepository,
    private readonly auditService: AuditService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    private readonly configService: ConfigService,
    private readonly pickupService: ReturnPickupService,
  ) {}

  private readonly bankDetailsLimiter = new InMemoryRateLimiter(10, 60_000);

  // ── Eligibility ───────────────────────────────────────────────────────────

  async getEligibilityForCustomer(
    orderId: string,
    customerId: string,
    expiredProductClaim = false,
  ): Promise<IOrderReturnEligibility> {
    const order = await this.requireOrder(orderId);
    this.assertOwnership(order, customerId);
    const eligibility = await this.eligibilityService.evaluateOrder(order, {
      isExpiredProductClaim: expiredProductClaim,
    });
    return {
      ...eligibility,
      paymentMethod: order.paymentMethod,
      codRefund: this.codRefundDestination(order),
    };
  }

  async getEligibilityForAdmin(
    orderId: string,
    expiredProductClaim = false,
  ): Promise<IOrderReturnEligibility> {
    const order = await this.requireOrder(orderId);
    const eligibility = await this.eligibilityService.evaluateOrder(order, {
      isExpiredProductClaim: expiredProductClaim,
    });
    return {
      ...eligibility,
      paymentMethod: order.paymentMethod,
      codRefund: this.codRefundDestination(order),
    };
  }

  // ── Creation ──────────────────────────────────────────────────────────────

  async createForCustomer(
    dto: CreateReturnRequestDto,
    actor: ReturnActor,
    evidence: IEvidenceUpload[] = [],
  ): Promise<ICreateReturnResult> {
    const order = await this.requireOrder(dto.orderId);
    this.assertOwnership(order, actor.id);
    return this.create({ dto, order, actor, evidence, customerVisibleReasonsOnly: true });
  }

  async createByAdmin(
    dto: AdminCreateReturnRequestDto,
    actor: ReturnActor,
    evidence: IEvidenceUpload[] = [],
  ): Promise<ICreateReturnResult> {
    if (dto.overrideEligibility && !dto.overrideReason?.trim()) {
      throw new BadRequestException({
        code: RETURN_OVERRIDE_JUSTIFICATION_REQUIRED,
        message: 'overrideReason is required when overriding eligibility',
      });
    }
    const order = await this.requireOrder(dto.orderId);
    return this.create({
      dto,
      order,
      actor,
      evidence,
      customerVisibleReasonsOnly: false,
      override: dto.overrideEligibility
        ? {
            reason: dto.overrideReason!.trim(),
            internalJustification: dto.internalJustification?.trim() ?? null,
            customerVisibleExplanation: dto.customerVisibleExplanation?.trim() ?? null,
          }
        : undefined,
    });
  }

  private async create(params: {
    dto: CreateReturnRequestDto;
    order: OrderEntity;
    actor: ReturnActor;
    evidence: IEvidenceUpload[];
    customerVisibleReasonsOnly: boolean;
    override?: {
      reason: string;
      internalJustification: string | null;
      customerVisibleExplanation: string | null;
    };
  }): Promise<ICreateReturnResult> {
    const { dto, order, actor, evidence, override } = params;

    if (evidence.length > RETURN_MAX_EVIDENCE_FILES) {
      throw new BadRequestException({
        code: RETURN_EVIDENCE_LIMIT_EXCEEDED,
        message: `A maximum of ${RETURN_MAX_EVIDENCE_FILES} evidence files can be attached`,
      });
    }

    const workflow =
      dto.resolution === ReturnResolution.REPLACEMENT
        ? ReasonWorkflow.REPLACEMENT
        : ReasonWorkflow.RETURN;
    const reason = await this.requireReason(dto.reasonId, workflow, params.customerVisibleReasonsOnly);

    this.assertReasonRequirements(reason, dto, evidence);
    this.assertConditionsConfirmed(dto.conditionDeclarations);

    const bankPatch = this.resolveRefundDestination(order, dto);

    const isExpiredProductClaim = reason.code === EXPIRED_PRODUCT_REASON_CODE;
    const eligibility = await this.eligibilityService.evaluateOrder(order, {
      isExpiredProductClaim,
    });

    const orderItemsById = new Map((order.items ?? []).map((item) => [item.id, item]));
    const eligibilityByItemId = new Map(
      eligibility.items.map((item) => [item.orderItemId, item]),
    );

    for (const line of dto.items) {
      const orderItem = orderItemsById.get(line.orderItemId);
      if (!orderItem) {
        throw new NotFoundException({
          code: RETURN_ITEM_NOT_FOUND,
          message: 'One or more items do not belong to this order',
        });
      }
      const itemEligibility = eligibilityByItemId.get(line.orderItemId);
      if (!itemEligibility) {
        throw new NotFoundException({
          code: RETURN_ITEM_NOT_FOUND,
          message: 'One or more items do not belong to this order',
        });
      }

      if (!override) {
        if (itemEligibility.ineligibilityCode) {
          throw new BadRequestException({
            code: itemEligibility.ineligibilityCode,
            message: itemEligibility.ineligibilityMessage,
          });
        }
        if (!itemEligibility.allowedResolutions.includes(dto.resolution)) {
          throw new BadRequestException({
            code: RETURN_RESOLUTION_NOT_ALLOWED,
            message: 'The selected resolution is not available for this item',
          });
        }
      }

      if (line.quantity > itemEligibility.availableQuantity) {
        throw new BadRequestException({
          code:
            itemEligibility.committedQuantity > 0
              ? ACTIVE_RETURN_ALREADY_EXISTS
              : RETURN_QUANTITY_EXCEEDED,
          message: `Only ${itemEligibility.availableQuantity} unit(s) of ${orderItem.sku} can be returned`,
        });
      }
    }

    const selectedPolicies = dto.items.map(
      (line) => eligibilityByItemId.get(line.orderItemId)!.policy,
    );
    const pickupRequired =
      reason.pickupMode !== ReasonPickupMode.NO_PICKUP_REQUIRED &&
      selectedPolicies.some((policy) => policy.pickupRequired);
    const qcRequired =
      reason.qcRequired || selectedPolicies.some((policy) => policy.qcRequired);

    const breakdown = await this.amountService.calculate(
      order,
      dto.items.map((line) => ({ orderItemId: line.orderItemId, quantity: line.quantity })),
    );

    const refId = await generateUniqueRefId('return', (candidate) =>
      this.returnRequestsRepository.existsByRefId(candidate),
    );
    const returnNumber = `RTN${refId}`;

    const earliestWindowExpiry = dto.items
      .map((line) => eligibilityByItemId.get(line.orderItemId)!.returnWindowExpiresAt)
      .filter((value): value is Date => value !== null)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;

    const created = await this.dataSource.transaction(async (manager) => {
      // Serialise concurrent submissions for the same order so the quantity
      // ledger cannot be read stale between the check above and the insert.
      await this.lockOrder(manager, order.id);
      const committed = await this.returnRequestsRepository.sumCommittedQuantityByOrderItem(
        dto.items.map((line) => line.orderItemId),
        { manager },
      );
      for (const line of dto.items) {
        const orderItem = orderItemsById.get(line.orderItemId)!;
        const already = committed.get(line.orderItemId) ?? 0;
        if (already + line.quantity > orderItem.quantity) {
          throw new ConflictException({
            code: ACTIVE_RETURN_ALREADY_EXISTS,
            message: `A return is already in progress for ${orderItem.sku}`,
          });
        }
      }

      const request = await this.returnRequestsRepository.create(
        {
          refId,
          returnNumber,
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.userId,
          status: ReturnStatus.REQUESTED,
          resolution: dto.resolution,
          reasonId: reason.id,
          reasonCode: reason.code,
          reasonTitle: reason.title,
          customerComments: dto.customerComments?.trim() ?? null,
          conditionDeclarations: dto.conditionDeclarations ?? null,
          pickupRequired,
          qcRequired,
          pickupAddress: dto.pickupAddress
            ? this.normalizePickupAddress(dto.pickupAddress)
            : this.defaultPickupAddress(order),
          isExpiredProductClaim,
          deliveredAt: order.deliveredAt ?? null,
          returnWindowExpiresAt: earliestWindowExpiry,
          requestedByType: actor.type,
          requestedById: actor.id,
          isAdminInitiated: actor.type === ReturnRequestedByType.ADMIN,
          eligibilityOverridden: Boolean(override),
          overrideReason: override?.reason ?? null,
          internalJustification: override?.internalJustification ?? null,
          customerVisibleExplanation: override?.customerVisibleExplanation ?? null,
          eligibilitySnapshot: eligibility as unknown as Record<string, unknown>,
          estimatedRefundAmount: breakdown.refundableAmount,
          currency: RETURN_CURRENCY,
          amountBreakdown: breakdown,
          ...bankPatch,
          createdBy: actor.email ?? actor.id,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );

      const netByOrderItemId = new Map(
        breakdown.items.map((item) => [item.orderItemId, item.netAmount]),
      );

      await this.returnRequestsRepository.createItems(
        await Promise.all(
          dto.items.map(async (line) => {
            const orderItem = orderItemsById.get(line.orderItemId)!;
            const itemEligibility = eligibilityByItemId.get(line.orderItemId)!;
            return {
              refId: await generateUniqueRefId('returnitem', (candidate) =>
                this.returnRequestsRepository.existsByItemRefId(candidate),
              ),
              returnRequestId: request.id,
              orderItemId: orderItem.id,
              productId: orderItem.productId,
              variantId: orderItem.variantId,
              sku: orderItem.sku,
              productName: orderItem.productName,
              variantName: orderItem.variantName,
              quantity: line.quantity,
              unitPrice: orderItem.unitPrice,
              refundableAmount: netByOrderItemId.get(orderItem.id) ?? toMoneyString(0),
              policySnapshot: itemEligibility.policy,
              deliveredAt: itemEligibility.deliveredAt,
              replacementVariantId: line.replacementVariantId ?? null,
              createdBy: actor.email ?? actor.id,
              updatedBy: actor.email ?? actor.id,
            };
          }),
        ),
        manager,
      );

      if (evidence.length > 0) {
        await this.evidencesRepository.createMany(
          await Promise.all(
            evidence.map(async (file) => ({
              refId: await generateUniqueRefId('returnevidence', (candidate) =>
                this.evidencesRepository.existsByRefId(candidate),
              ),
              returnRequestId: request.id,
              returnRequestItemId: null,
              mediaType: file.mediaType,
              source:
                actor.type === ReturnRequestedByType.ADMIN
                  ? ReturnEvidenceSource.ADMIN
                  : ReturnEvidenceSource.CUSTOMER,
              file: this.storageUrlEnricher.persist(file.path) as IStorageFileReference,
              originalFilename: file.originalFilename ?? null,
              mimeType: file.mimeType ?? null,
              sizeBytes: file.sizeBytes != null ? String(file.sizeBytes) : null,
              uploadedById: actor.id,
              createdBy: actor.email ?? actor.id,
              updatedBy: actor.email ?? actor.id,
            })),
          ),
          manager,
        );
      }

      await this.returnRequestsRepository.addHistory(
        {
          returnRequestId: request.id,
          fromStatus: null,
          toStatus: ReturnStatus.REQUESTED,
          action: ReturnHistoryAction.CREATED,
          comment: override ? 'Return created by admin with eligibility override' : null,
          isCustomerVisible: true,
          performedBy: actor.email ?? actor.id,
          performedByRole: actor.role ?? null,
          metadata: {
            resolution: dto.resolution,
            reasonCode: reason.code,
            itemCount: dto.items.length,
          },
        },
        manager,
      );

      if (override) {
        await this.returnRequestsRepository.addHistory(
          {
            returnRequestId: request.id,
            fromStatus: ReturnStatus.REQUESTED,
            toStatus: ReturnStatus.REQUESTED,
            action: ReturnHistoryAction.ELIGIBILITY_OVERRIDDEN,
            comment: override.reason,
            isCustomerVisible: false,
            performedBy: actor.email ?? actor.id,
            performedByRole: actor.role ?? null,
            metadata: null,
          },
          manager,
        );
      }

      return request;
    });

    await this.auditService.log({
      entityType: AuditEntityType.RETURN_REQUEST,
      entityId: created.id,
      entityRefId: created.refId,
      action: ReturnHistoryAction.CREATED,
      performedBy: actor.email ?? actor.id,
      details: {
        returnNumber,
        orderNumber: order.orderNumber,
        resolution: dto.resolution,
        eligibilityOverridden: Boolean(override),
      },
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_REQUEST_CREATED, {
      returnRequestId: created.id,
      returnNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.userId,
      resolution: dto.resolution,
    });

    return {
      returnRequestId: created.id,
      returnNumber,
      status: ReturnStatus.REQUESTED,
      message: RETURN_SUBMITTED_CUSTOMER_MESSAGE,
    };
  }

  // ── Customer reads and actions ────────────────────────────────────────────

  async listForOrder(orderId: string, customerId?: string): Promise<ReturnRequestEntity[]> {
    if (customerId) {
      return this.returnRequestsRepository.findByOrderIdForCustomer(orderId, customerId);
    }
    const pagination = buildPaginationOptions({ page: 1, limit: 50 });
    const { data } = await this.returnRequestsRepository.findAllPaginated({
      ...pagination,
      orderId,
    });
    return data;
  }

  async listForCustomer(
    customerId: string,
    query: { page?: number; limit?: number; search?: string },
  ): Promise<PaginatedResult<IReturnRequestListItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.returnRequestsRepository.findAllPaginated({
      ...pagination,
      customerId,
      search: query.search,
    });
    return buildPaginatedResult(data.map((item) => mapReturnToListItem(item)), total, pagination);
  }

  async getForCustomer(identifier: string, customerId: string): Promise<ICustomerReturnDetail> {
    const request = await this.requireReturn(identifier);
    if (request.customerId !== customerId) {
      throw new ForbiddenException({
        code: RETURN_ACCESS_DENIED,
        message: 'You do not have access to this return request',
      });
    }
    const evidence = await this.evidencesRepository.findByReturnRequestId(request.id);
    const pickup = await this.pickupsRepository.findActiveByReturnRequestId(request.id);

    const detail = mapCustomerReturnDetail(request, {
      evidence,
      pickup,
      refund: {
        status: request.refundRequestId ? 'LINKED' : null,
        amount: request.approvedRefundAmount,
        message: request.refundRequestId
          ? 'A refund has been created for this return and is tracked separately.'
          : null,
      },
    });
    return this.storageUrlEnricher.enrichDeep(detail);
  }

  async updateBankDetails(
    identifier: string,
    customerId: string,
    dto: SubmitReturnBankDetailsDto,
  ): Promise<ICustomerReturnDetail> {
    if (!this.bankDetailsLimiter.consume(`customer:${customerId}`)) {
      throw new BadRequestException({
        code: COD_PAYOUT_RATE_LIMITED,
        message: 'Too many bank-detail updates. Please wait a minute and try again.',
      });
    }

    const request = await this.requireReturn(identifier);
    if (request.customerId !== customerId) {
      throw new ForbiddenException({
        code: RETURN_ACCESS_DENIED,
        message: 'You do not have access to this return request',
      });
    }
    if (request.bankDetailsLocked || !isCustomerCancellable(request.status)) {
      throw new BadRequestException({
        code: BANK_DETAILS_LOCKED,
        message: 'Bank details cannot be changed after the return is approved. Contact support.',
      });
    }

    const order = await this.requireOrder(request.orderId);
    const patch = this.resolveRefundDestination(order, {
      ...dto,
      resolution: request.resolution,
    });

    await this.returnRequestsRepository.updateById(request.id, {
      ...patch,
      updatedBy: customerId,
    });
    await this.auditService.log({
      entityType: AuditEntityType.RETURN_REQUEST,
      entityId: request.id,
      entityRefId: request.refId,
      action: 'BANK_DETAILS_UPDATED',
      performedBy: customerId,
      details: {
        refundMethod: patch.refundMethod,
        accountNumberLast4: patch.bankAccountNumberLast4 ?? null,
      },
    });
    return this.getForCustomer(identifier, customerId);
  }

  async cancelByCustomer(
    identifier: string,
    customerId: string,
    dto: CancelReturnRequestDto,
  ): Promise<ICustomerReturnDetail> {
    const request = await this.requireReturn(identifier);
    if (request.customerId !== customerId) {
      throw new ForbiddenException({
        code: RETURN_ACCESS_DENIED,
        message: 'You do not have access to this return request',
      });
    }
    if (!isCustomerCancellable(request.status)) {
      throw new BadRequestException({
        code: RETURN_CANCELLATION_NOT_ALLOWED,
        message: 'This return can no longer be cancelled. Please contact support.',
      });
    }

    const pickup = await this.pickupsRepository.findActiveByReturnRequestId(request.id);
    if (pickup?.reverseAwbNumber) {
      try {
        await this.pickupService.cancel(pickup.provider, {
          returnRequestId: request.id,
          reverseAwbNumber: pickup.reverseAwbNumber,
          strict: true,
        });
      } catch (error) {
        throw new ConflictException({
          code: RETURN_CANCELLATION_NOT_ALLOWED,
          message:
            'A reverse pickup is already booked and could not be cancelled with the courier. Contact support. Withdrawal is not complete while the pickup is live.',
        });
      }
    }

    const now = new Date();
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.returnRequestsRepository.lockById(request.id, manager);
      if (!locked || !isCustomerCancellable(locked.status)) {
        throw new ConflictException({
          code: RETURN_CANCELLATION_NOT_ALLOWED,
          message: 'This return can no longer be cancelled. Please contact support.',
        });
      }
      await this.returnRequestsRepository.updateById(
        request.id,
        {
          status: ReturnStatus.CANCELLED_BY_CUSTOMER,
          cancelledAt: now,
          cancelledBy: customerId,
          updatedBy: customerId,
        },
        manager,
      );
      await this.returnRequestsRepository.addHistory(
        {
          returnRequestId: request.id,
          fromStatus: locked.status,
          toStatus: ReturnStatus.CANCELLED_BY_CUSTOMER,
          action: ReturnHistoryAction.CANCELLED,
          comment: dto.comment?.trim() ?? null,
          isCustomerVisible: true,
          performedBy: customerId,
          performedByRole: 'CUSTOMER',
          metadata: pickup
            ? { reverseAwbNumber: pickup.reverseAwbNumber, pickupCancelled: true }
            : null,
        },
        manager,
      );
      if (pickup) {
        await this.pickupsRepository.updateById(
          pickup.id,
          { status: ReturnPickupStatus.CANCELLED, updatedBy: customerId },
          manager,
        );
      }
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_CANCELLED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      orderId: request.orderId,
      customerId,
    });

    return this.getForCustomer(identifier, customerId);
  }

  async submitAdditionalInformation(
    identifier: string,
    customerId: string,
    dto: SubmitAdditionalInformationDto,
    evidence: IEvidenceUpload[] = [],
  ): Promise<ICustomerReturnDetail> {
    const request = await this.requireReturn(identifier);
    if (request.customerId !== customerId) {
      throw new ForbiddenException({
        code: RETURN_ACCESS_DENIED,
        message: 'You do not have access to this return request',
      });
    }
    if (request.status !== ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED) {
      throw new BadRequestException({
        code: RETURN_NOT_ALLOWED,
        message: 'No additional information has been requested for this return',
      });
    }

    const counts = await this.evidencesRepository.countByMediaType(request.id);
    const existingTotal =
      counts[ReturnEvidenceMediaType.IMAGE] + counts[ReturnEvidenceMediaType.VIDEO];
    if (existingTotal + evidence.length > RETURN_MAX_EVIDENCE_FILES) {
      throw new BadRequestException({
        code: RETURN_EVIDENCE_LIMIT_EXCEEDED,
        message: `A maximum of ${RETURN_MAX_EVIDENCE_FILES} evidence files can be attached`,
      });
    }

    await this.dataSource.transaction(async (manager) => {
      if (evidence.length > 0) {
        await this.evidencesRepository.createMany(
          await Promise.all(
            evidence.map(async (file) => ({
              refId: await generateUniqueRefId('returnevidence', (candidate) =>
                this.evidencesRepository.existsByRefId(candidate),
              ),
              returnRequestId: request.id,
              returnRequestItemId: null,
              mediaType: file.mediaType,
              source: ReturnEvidenceSource.CUSTOMER,
              file: this.storageUrlEnricher.persist(file.path) as IStorageFileReference,
              originalFilename: file.originalFilename ?? null,
              mimeType: file.mimeType ?? null,
              sizeBytes: file.sizeBytes != null ? String(file.sizeBytes) : null,
              uploadedById: customerId,
              createdBy: customerId,
              updatedBy: customerId,
            })),
          ),
          manager,
        );
      }

      await this.returnRequestsRepository.updateById(
        request.id,
        { status: ReturnStatus.UNDER_REVIEW, updatedBy: customerId },
        manager,
      );
      await this.returnRequestsRepository.addHistory(
        {
          returnRequestId: request.id,
          fromStatus: request.status,
          toStatus: ReturnStatus.UNDER_REVIEW,
          action: ReturnHistoryAction.ADDITIONAL_INFORMATION_SUBMITTED,
          comment: dto.message.trim(),
          isCustomerVisible: true,
          performedBy: customerId,
          performedByRole: 'CUSTOMER',
          metadata: { evidenceCount: evidence.length },
        },
        manager,
      );
    });

    return this.getForCustomer(identifier, customerId);
  }

  async listReasonsForCustomer(workflow: ReasonWorkflow): Promise<ICustomerReturnReason[]> {
    const reasons = await this.reasonMastersRepository.findActiveByWorkflow(workflow, {
      customerVisibleOnly: true,
    });
    return reasons.map((reason) => ({
      id: reason.id,
      refId: reason.refId,
      code: reason.code,
      title: reason.title,
      description: reason.description,
      commentsRequired: reason.commentsRequired,
      imagesRequired: reason.imagesRequired,
      videoRequired: reason.videoRequired,
      minImages: reason.minImages,
      maxImages: reason.maxImages,
      minVideos: reason.minVideos,
      maxVideos: reason.maxVideos,
      pickupMode: reason.pickupMode,
    }));
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  async requireOrder(orderId: string): Promise<OrderEntity> {
    const order = await this.ordersRepository.findOne({
      where: [{ id: orderId }, { orderNumber: orderId }, { refId: orderId }],
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: RETURN_ORDER_NOT_FOUND,
        message: 'Order not found',
      });
    }
    return order;
  }

  async requireReturn(identifier: string): Promise<ReturnRequestEntity> {
    const request = await this.returnRequestsRepository.findByAnyIdentifier(identifier);
    if (!request) {
      throw new NotFoundException({
        code: RETURN_REQUEST_NOT_FOUND,
        message: 'Return request not found',
      });
    }
    return request;
  }

  private assertOwnership(order: OrderEntity, customerId: string): void {
    if (order.userId !== customerId) {
      throw new ForbiddenException({
        code: RETURN_ACCESS_DENIED,
        message: 'You do not have access to this order',
      });
    }
  }

  private async requireReason(
    reasonId: string,
    workflow: ReasonWorkflow,
    customerVisibleOnly: boolean,
  ): Promise<ReasonMasterEntity> {
    const reason = await this.reasonMastersRepository.findByIdOrRefId(reasonId);
    if (
      !reason ||
      reason.status !== MasterStatus.ACTIVE ||
      !reason.workflows?.includes(workflow) ||
      (customerVisibleOnly && !reason.isCustomerVisible)
    ) {
      throw new BadRequestException({
        code: INVALID_RETURN_REASON,
        message: 'The selected reason is not available for this request',
      });
    }
    return reason;
  }

  private assertReasonRequirements(
    reason: ReasonMasterEntity,
    dto: CreateReturnRequestDto,
    evidence: IEvidenceUpload[],
  ): void {
    if (reason.commentsRequired && (dto.customerComments?.trim().length ?? 0) < 10) {
      throw new BadRequestException({
        code: RETURN_COMMENTS_REQUIRED,
        message: 'Please describe the issue in at least 10 characters',
      });
    }

    const images = evidence.filter(
      (file) => file.mediaType === ReturnEvidenceMediaType.IMAGE,
    ).length;
    const videos = evidence.filter(
      (file) => file.mediaType === ReturnEvidenceMediaType.VIDEO,
    ).length;

    const requiredImages = reason.imagesRequired ? Math.max(1, reason.minImages) : reason.minImages;
    const requiredVideos = reason.videoRequired ? Math.max(1, reason.minVideos) : reason.minVideos;

    if (images < requiredImages) {
      throw new BadRequestException({
        code: EVIDENCE_REQUIRED,
        message: `Please attach at least ${requiredImages} photo(s) for the selected reason`,
      });
    }
    if (videos < requiredVideos) {
      throw new BadRequestException({
        code: EVIDENCE_REQUIRED,
        message: `Please attach at least ${requiredVideos} video(s) for the selected reason`,
      });
    }
    if (images > reason.maxImages || videos > reason.maxVideos) {
      throw new BadRequestException({
        code: RETURN_EVIDENCE_LIMIT_EXCEEDED,
        message: `Please attach no more than ${reason.maxImages} photo(s) and ${reason.maxVideos} video(s)`,
      });
    }
  }

  private assertConditionsConfirmed(declarations?: Record<string, boolean>): void {
    if (!declarations) return;
    const unconfirmed = Object.entries(declarations)
      .filter(([, confirmed]) => confirmed !== true)
      .map(([key]) => key);
    if (unconfirmed.length > 0) {
      throw new BadRequestException({
        code: RETURN_CONDITIONS_NOT_CONFIRMED,
        message: `Please confirm all return conditions: ${unconfirmed.join(', ')}`,
      });
    }
  }

  private normalizePickupAddress(address: ReturnPickupAddressDto): IReturnPickupAddress {
    return {
      recipientName: address.recipientName,
      phoneNumber: address.phoneNumber,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? null,
      landmark: address.landmark ?? null,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
    };
  }

  private defaultPickupAddress(order: OrderEntity): IReturnPickupAddress {
    return {
      recipientName: order.recipientName,
      phoneNumber: order.phoneNumber,
      addressLine1: order.addressLine1,
      addressLine2: order.addressLine2,
      landmark: order.landmark,
      city: order.city,
      state: order.state,
      pincode: order.pincode,
    };
  }

  private walletRefundEnabled(): boolean {
    return this.configService.get<boolean>('returns.wallet.refundEnabled') ?? true;
  }

  private codRefundDestination(order: OrderEntity) {
    return describeCodRefundDestination(order.paymentMethod, this.walletRefundEnabled());
  }

  private resolveRefundDestination(
    order: OrderEntity,
    dto: Pick<CreateReturnRequestDto, 'resolution' | 'refundMethod' | 'bankDetails'>,
  ): Partial<ReturnRequestEntity> {
    if (dto.resolution !== ReturnResolution.REFUND || !orderHasCodRefundPortion(order.paymentMethod)) {
      if (dto.refundMethod || dto.bankDetails) {
        throw new BadRequestException({
          code: BANK_DETAILS_NOT_APPLICABLE,
          message:
            'Bank or wallet refund details are only collected for cash-on-delivery amounts',
        });
      }
      return {
        refundMethod: null,
        bankAccountHolderName: null,
        bankAccountNumberEncrypted: null,
        bankAccountNumberLast4: null,
        bankIfsc: null,
        bankName: null,
        bankAccountType: null,
        bankDetailsSubmittedAt: null,
        bankDetailsLocked: false,
      };
    }

    const destination = this.codRefundDestination(order);
    const method = dto.refundMethod ?? destination.defaultMethod;
    if (!destination.allowedMethods.includes(method)) {
      throw new BadRequestException({
        code: method === CodRefundMethod.WALLET ? WALLET_REFUND_NOT_ENABLED : COD_REFUND_METHOD_REQUIRED,
        message:
          method === CodRefundMethod.WALLET
            ? 'Cureka Wallet refunds are not enabled'
            : 'Select bank account or Cureka Wallet for the COD refund',
      });
    }
    if (!dto.refundMethod) {
      throw new BadRequestException({
        code: COD_REFUND_METHOD_REQUIRED,
        message: 'Select how the cash-on-delivery amount should be refunded',
      });
    }

    const encrypted = requireBankDetailsForMethod(method, dto.bankDetails);
    return {
      refundMethod: method,
      bankAccountHolderName: encrypted?.bankAccountHolderName ?? null,
      bankAccountNumberEncrypted: encrypted?.bankAccountNumberEncrypted ?? null,
      bankAccountNumberLast4: encrypted?.bankAccountNumberLast4 ?? null,
      bankIfsc: encrypted?.bankIfsc ?? null,
      bankName: encrypted?.bankName ?? null,
      bankAccountType: encrypted?.bankAccountType ?? null,
      bankDetailsSubmittedAt: encrypted?.bankDetailsSubmittedAt ?? (method === CodRefundMethod.WALLET ? new Date() : null),
      bankDetailsLocked: false,
    };
  }

  private async lockOrder(manager: EntityManager, orderId: string): Promise<void> {
    await manager
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.id = :orderId', { orderId })
      .getOne();
  }
}
