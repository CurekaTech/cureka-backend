import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '@modules/master/services/audit.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { parseMoney, toMoneyString } from '@modules/orders/utils/money.util';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { EVENTS } from '@packages/events';
import { DataSource, EntityManager } from 'typeorm';
import {
  REFUND_ALREADY_INITIATED,
  REFUND_ALREADY_PROCESSED,
  REFUND_AMOUNT_EXCEEDS_AVAILABLE_AMOUNT,
  REFUND_AMOUNT_INVALID,
  REFUND_CURRENCY,
  REFUND_FULL_AMOUNT_REQUIRED,
  REFUND_INVALID_STATUS_TRANSITION,
  REFUND_NOT_APPROVED,
  REFUND_NOT_REQUIRED,
  REFUND_PROVIDER_NOT_FOUND,
  REFUND_REQUEST_ALREADY_EXISTS,
  REFUND_REQUEST_NOT_FOUND,
  REFUND_RETRY_NOT_ALLOWED,
} from '../constants/refund-request.constants';
import {
  ApproveRefundRequestDto,
  AssignRefundRequestDto,
  CreateAdminRefundRequestDto,
  RefundCommentDto,
  RefundRequestListQueryDto,
  RejectRefundRequestDto,
  RetryRefundRequestDto,
} from '../dto/refund-request.dto';
import { RefundHistoryAction } from '../enums/refund-history-action.enum';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundReason } from '../enums/refund-reason.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';
import { RefundRequestedByType } from '../enums/refund-requested-by-type.enum';
import { RefundRequestEntity } from '../entities/refund-request.entity';
import {
  ICustomerRefundView,
  IRefundRequestDetail,
  IRefundRequestListItem,
  RefundActor,
} from '../interfaces/refund-request.interface';
import {
  addWorkingDays,
  buildAvailableActions,
  mapCustomerRefundView,
  mapRefundRequestToDetail,
  mapRefundRequestToListItem,
} from '../mappers/refund-request.mapper';
import { RefundRequestsRepository } from '../repositories/refund-requests.repository';
import {
  canTransitionRefundStatus,
  isInitiatableRefundStatus,
} from '../utils/refund-status-transition.util';
import { RefundAmountService } from './refund-amount.service';
import { RefundProcessorService } from './refund-processor.service';
import { RefundProviderResolverService } from './refund-provider-resolver.service';

@Injectable()
export class RefundRequestsService {
  private readonly logger = new Logger(RefundRequestsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly refundRequestsRepository: RefundRequestsRepository,
    private readonly amountService: RefundAmountService,
    private readonly providerResolver: RefundProviderResolverService,
    private readonly processor: RefundProcessorService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createFromOrderCancellation(
    order: OrderEntity,
    actor: RefundActor,
    reasonDetails: string,
  ): Promise<RefundRequestEntity | null> {
    const existing = await this.refundRequestsRepository.findActiveByOrderId(order.id);
    if (existing) {
      return existing;
    }

    const refundable = await this.amountService.calculateRefundableAmount(order);
    if (!refundable.requiresOnlineRefund || parseMoney(refundable.refundableAmount) <= 0) {
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber },
        'Cancellation does not require an online refund request',
      );
      return null;
    }

    const resolution = await this.providerResolver.resolve(order);
    if (resolution.paymentProvider === RefundPaymentProvider.COD) {
      return null;
    }

    try {
      const created = await this.persistNewRequest({
        order,
        reason: RefundReason.CUSTOMER_CANCELLATION,
        reasonDetails,
        requestedAmount: refundable.refundableAmount,
        actor,
        comment: reasonDetails,
      });
      await this.eventEmitter.emitAsync(EVENTS.REFUND_REQUEST_CREATED, {
        refundRequestId: created.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
      });
      return created;
    } catch (error) {
      if (this.isDuplicateActive(error)) {
        return this.refundRequestsRepository.findActiveByOrderId(order.id);
      }
      throw error;
    }
  }

  async createByAdmin(
    dto: CreateAdminRefundRequestDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const order = await this.requireOrder(dto.orderId);
    if (dto.reason === RefundReason.OTHER && !dto.reasonDetails?.trim()) {
      throw new BadRequestException({
        code: REFUND_AMOUNT_INVALID,
        message: 'reasonDetails is required when reason is OTHER',
      });
    }
    const existing = await this.refundRequestsRepository.findActiveByOrderId(order.id);
    if (existing) {
      throw new ConflictException({
        code: REFUND_REQUEST_ALREADY_EXISTS,
        message: 'An active refund request already exists for this order',
      });
    }
    const created = await this.persistNewRequest({
      order,
      reason: dto.reason,
      reasonDetails: dto.reasonDetails?.trim() ?? null,
      requestedAmount: dto.requestedAmount,
      actor,
      comment: dto.comment,
    });
    await this.eventEmitter.emitAsync(EVENTS.REFUND_REQUEST_CREATED, {
      refundRequestId: created.id,
      orderId: order.id,
    });
    return this.toDetail(created, actor);
  }

  async list(
    query: RefundRequestListQueryDto,
  ): Promise<PaginatedResult<IRefundRequestListItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.refundRequestsRepository.findAllPaginated({
      ...pagination,
      status: query.status,
      reason: query.reason,
      paymentProvider: query.paymentProvider,
      orderId: query.orderId,
      orderNumber: query.orderNumber,
      customerId: query.customerId,
      assignedTo: query.assignedTo,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      slaStatus: query.slaStatus,
    });
    const items = data.map((entity) => mapRefundRequestToListItem(entity));
    return buildPaginatedResult(items, total, pagination);
  }

  async getAdminDetail(idOrRefId: string, actor: RefundActor): Promise<IRefundRequestDetail> {
    const entity = await this.requireRequest(idOrRefId);
    return this.toDetail(entity, actor);
  }

  async getCustomerRefund(orderId: string, customerId: string): Promise<ICustomerRefundView | null> {
    const order = await this.requireOrder(orderId);
    if (order.userId !== customerId) {
      throw new NotFoundException({
        code: REFUND_REQUEST_NOT_FOUND,
        message: 'Refund request not found',
      });
    }
    const entity = await this.refundRequestsRepository.findLatestByOrderId(orderId);
    return entity ? mapCustomerRefundView(entity) : null;
  }

  async review(
    idOrRefId: string,
    dto: RefundCommentDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    return this.transition({
      idOrRefId,
      actor,
      toStatus: RefundRequestStatus.UNDER_REVIEW,
      action: RefundHistoryAction.REVIEWED,
      comment: dto.comment,
      patch: (entity) => ({
        reviewedBy: actor.id,
        reviewedAt: new Date(),
        updatedBy: actor.email ?? actor.id,
      }),
    });
  }

  async approve(
    idOrRefId: string,
    dto: ApproveRefundRequestDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const current = await this.requireRequest(idOrRefId);
    const order = await this.requireOrder(current.orderId);
    const refundable = await this.amountService.calculateRefundableAmount(order, current.id);
    const approvedAmount = dto.approvedAmount
      ? toMoneyString(parseMoney(dto.approvedAmount))
      : current.requestedAmount;
    if (parseMoney(approvedAmount) <= 0) {
      throw new BadRequestException({
        code: REFUND_AMOUNT_INVALID,
        message: 'Approved amount must be greater than zero',
      });
    }
    if (parseMoney(approvedAmount) > parseMoney(refundable.refundableAmount)) {
      throw new BadRequestException({
        code: REFUND_AMOUNT_EXCEEDS_AVAILABLE_AMOUNT,
        message: 'Approved amount exceeds the refundable captured amount',
      });
    }
    if (parseMoney(approvedAmount) !== parseMoney(refundable.refundableAmount)) {
      throw new BadRequestException({
        code: REFUND_FULL_AMOUNT_REQUIRED,
        message: 'Partial refunds are not supported in this version; approve the full refundable amount',
      });
    }

    const detail = await this.transition({
      idOrRefId,
      actor,
      toStatus: RefundRequestStatus.APPROVED,
      action: RefundHistoryAction.APPROVED,
      comment: dto.comment,
      patch: () => ({
        approvedAmount,
        approvedBy: actor.id,
        approvedAt: new Date(),
        updatedBy: actor.email ?? actor.id,
      }),
    });
    await this.eventEmitter.emitAsync(EVENTS.REFUND_REQUEST_APPROVED, {
      refundRequestId: detail.id,
    });
    return detail;
  }

  async reject(
    idOrRefId: string,
    dto: RejectRefundRequestDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const detail = await this.transition({
      idOrRefId,
      actor,
      toStatus: RefundRequestStatus.REJECTED,
      action: RefundHistoryAction.REJECTED,
      comment: dto.comment ?? dto.reason,
      patch: () => ({
        rejectedBy: actor.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        updatedBy: actor.email ?? actor.id,
      }),
    });
    await this.eventEmitter.emitAsync(EVENTS.REFUND_REQUEST_REJECTED, {
      refundRequestId: detail.id,
    });
    return detail;
  }

  async assign(
    idOrRefId: string,
    dto: AssignRefundRequestDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const entity = await this.requireRequest(idOrRefId);
    if (!dto.assignedToUserId && !dto.assignedRoleId) {
      throw new BadRequestException('assignedToUserId or assignedRoleId is required');
    }
    await this.refundRequestsRepository.updateById(entity.id, {
      assignedToUserId: dto.assignedToUserId ?? entity.assignedToUserId,
      assignedRoleId: dto.assignedRoleId ?? entity.assignedRoleId,
      updatedBy: actor.email ?? actor.id,
    });
    await this.refundRequestsRepository.addHistory({
      refundRequestId: entity.id,
      fromStatus: entity.status,
      toStatus: entity.status,
      action: RefundHistoryAction.ASSIGNED,
      comment: dto.comment ?? null,
      performedBy: actor.email ?? actor.id,
      performedByRole: actor.role ?? null,
      metadata: {
        assignedToUserId: dto.assignedToUserId ?? null,
        assignedRoleId: dto.assignedRoleId ?? null,
      },
    });
    await this.audit(entity, 'ASSIGNED', actor, { assignedToUserId: dto.assignedToUserId });
    return this.getAdminDetail(entity.id, actor);
  }

  async addComment(
    idOrRefId: string,
    dto: RefundCommentDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const entity = await this.requireRequest(idOrRefId);
    if (!dto.comment?.trim()) {
      throw new BadRequestException('comment is required');
    }
    await this.refundRequestsRepository.addHistory({
      refundRequestId: entity.id,
      fromStatus: entity.status,
      toStatus: entity.status,
      action: RefundHistoryAction.COMMENT_ADDED,
      comment: dto.comment.trim(),
      performedBy: actor.email ?? actor.id,
      performedByRole: actor.role ?? null,
      metadata: null,
    });
    await this.audit(entity, 'COMMENT_ADDED', actor);
    return this.getAdminDetail(entity.id, actor);
  }

  async initiate(
    idOrRefId: string,
    dto: RefundCommentDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lockOrThrow(idOrRefId, manager);
      if (locked.status === RefundRequestStatus.PROCESSED || locked.status === RefundRequestStatus.CLOSED) {
        throw new ConflictException({
          code: REFUND_ALREADY_PROCESSED,
          message: 'This refund has already been processed',
        });
      }
      if (locked.status === RefundRequestStatus.PROCESSING) {
        throw new ConflictException({
          code: REFUND_ALREADY_INITIATED,
          message: 'A provider refund has already been initiated for this request',
        });
      }
      if (!isInitiatableRefundStatus(locked.status)) {
        throw new BadRequestException({
          code: locked.status === RefundRequestStatus.FAILED ? REFUND_RETRY_NOT_ALLOWED : REFUND_NOT_APPROVED,
          message: 'Refund can only be initiated after approval',
        });
      }

      const order = await this.requireOrder(locked.orderId, manager);
      const resolution = await this.providerResolver.resolve(order);
      if (!resolution.identifiable || !resolution.paymentProvider || resolution.paymentProvider === RefundPaymentProvider.OTHER) {
        throw new BadRequestException({
          code: REFUND_PROVIDER_NOT_FOUND,
          message: resolution.unresolvedReason ?? 'Original payment source could not be identified',
        });
      }
      const amount = parseMoney(locked.approvedAmount ?? locked.requestedAmount);
      if (amount <= 0) {
        throw new BadRequestException({
          code: REFUND_AMOUNT_INVALID,
          message: 'Approved refund amount is invalid',
        });
      }

      const previousStatus = locked.status;
      await this.applyStatusChange(manager, locked, RefundRequestStatus.PROCESSING, {
        processingStartedBy: actor.id,
        processingStartedAt: new Date(),
        paymentProvider: resolution.paymentProvider,
        providerPaymentId: resolution.providerPaymentId ?? locked.providerPaymentId,
        paymentRequestId: resolution.paymentRequestId ?? locked.paymentRequestId,
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, { ...locked, status: previousStatus }, RefundRequestStatus.PROCESSING, RefundHistoryAction.INITIATED, actor, dto.comment);

      const result = await this.processor.initiate(
        {
          ...locked,
          paymentProvider: resolution.paymentProvider,
          providerPaymentId: resolution.providerPaymentId ?? locked.providerPaymentId,
          paymentRequestId: resolution.paymentRequestId ?? locked.paymentRequestId,
        },
        order,
        amount,
        dto.comment?.trim() || `Refund ${locked.refId}`,
      );

      await this.applyProviderResult(manager, locked, result, actor, RefundHistoryAction.INITIATED);
      await this.eventEmitter.emitAsync(EVENTS.REFUND_PROCESSING_STARTED, { refundRequestId: locked.id });
      const reloaded = await this.refundRequestsRepository.findById(locked.id, manager);
      return this.toDetail(reloaded ?? locked, actor);
    });
  }

  async retry(
    idOrRefId: string,
    dto: RetryRefundRequestDto,
    actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lockOrThrow(idOrRefId, manager);
      if (locked.status !== RefundRequestStatus.FAILED) {
        throw new BadRequestException({
          code: REFUND_RETRY_NOT_ALLOWED,
          message: 'Retry is only allowed after a conclusive provider failure',
        });
      }
      if (locked.failureCode === 'PENDING_RECONCILIATION') {
        throw new BadRequestException({
          code: REFUND_RETRY_NOT_ALLOWED,
          message: 'Reconcile the previous attempt before retrying',
        });
      }
      const previousStatus = locked.status;
      await this.applyStatusChange(manager, locked, RefundRequestStatus.PROCESSING, {
        processingStartedBy: actor.id,
        processingStartedAt: new Date(),
        failedAt: null,
        failureCode: null,
        failureMessage: null,
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(
        manager,
        { ...locked, status: previousStatus },
        RefundRequestStatus.PROCESSING,
        RefundHistoryAction.RETRIED,
        actor,
        dto.comment,
      );
      const order = await this.requireOrder(locked.orderId, manager);
      const amount = parseMoney(locked.approvedAmount ?? locked.requestedAmount);
      const result = await this.processor.initiate(
        { ...locked, status: RefundRequestStatus.PROCESSING },
        order,
        amount,
        dto.comment,
      );
      await this.applyProviderResult(manager, locked, result, actor, RefundHistoryAction.RETRIED);
      const reloaded = await this.refundRequestsRepository.findById(locked.id, manager);
      return this.toDetail(reloaded ?? locked, actor);
    });
  }

  async reconcile(idOrRefId: string, actor: RefundActor): Promise<IRefundRequestDetail> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lockOrThrow(idOrRefId, manager);
      const result = await this.processor.reconcile(locked);
      await this.applyProviderResult(manager, locked, result, actor, RefundHistoryAction.RECONCILED);
      const reloaded = await this.refundRequestsRepository.findById(locked.id, manager);
      return this.toDetail(reloaded ?? locked, actor);
    });
  }

  async applyProviderWebhook(params: {
    provider: RefundPaymentProvider;
    providerRefundId?: string | null;
    merchantRefundReference?: string | null;
    providerStatus: string;
    orderId?: string | null;
  }): Promise<void> {
    const entity =
      (params.providerRefundId
        ? await this.refundRequestsRepository.findByProviderRefundId(params.providerRefundId)
        : null) ??
      (params.merchantRefundReference
        ? await this.refundRequestsRepository.findByMerchantRefundReference(
            params.merchantRefundReference,
          )
        : null) ??
      (params.orderId ? await this.refundRequestsRepository.findActiveByOrderId(params.orderId) : null);

    if (!entity) {
      this.logger.log(
        {
          provider: params.provider,
          providerRefundId: params.providerRefundId ?? null,
        },
        'Provider refund webhook did not match a refund request',
      );
      return;
    }

    if (entity.status === RefundRequestStatus.PROCESSED || entity.status === RefundRequestStatus.CLOSED) {
      return;
    }
    const incomingRefundId = params.providerRefundId ?? entity.providerRefundId;
    if (
      entity.providerRefundStatus === params.providerStatus &&
      (incomingRefundId ?? null) === (entity.providerRefundId ?? null)
    ) {
      return;
    }

    const systemActor: RefundActor = {
      id: 'system',
      role: 'system',
      type: RefundRequestedByType.SYSTEM,
    };
    const normalized = params.providerStatus.toLowerCase();
    const completed = normalized.includes('success') || normalized === 'processed';
    const failed = normalized.includes('fail') || normalized.includes('cancel');
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.refundRequestsRepository.lockById(entity.id, manager);
      if (!locked) return;
      await this.applyProviderResult(
        manager,
        locked,
        {
          providerRefundId: params.providerRefundId ?? locked.providerRefundId,
          providerStatus: params.providerStatus,
          completed,
          failed,
          uncertain: !completed && !failed,
          responseReference: params.providerRefundId ?? locked.providerRefundId,
        },
        systemActor,
        RefundHistoryAction.PROVIDER_UPDATED,
      );
    });
  }

  private async persistNewRequest(params: {
    order: OrderEntity;
    reason: RefundReason;
    reasonDetails: string | null;
    requestedAmount?: string;
    actor: RefundActor;
    comment?: string;
  }): Promise<RefundRequestEntity> {
    const refundable = await this.amountService.calculateRefundableAmount(params.order);
    if (!refundable.requiresOnlineRefund || parseMoney(refundable.refundableAmount) <= 0) {
      throw new BadRequestException({
        code: REFUND_NOT_REQUIRED,
        message: 'This order has no captured online amount to refund',
      });
    }

    const requestedAmount = params.requestedAmount
      ? toMoneyString(parseMoney(params.requestedAmount))
      : refundable.refundableAmount;
    if (parseMoney(requestedAmount) <= 0) {
      throw new BadRequestException({
        code: REFUND_AMOUNT_INVALID,
        message: 'Refund amount must be greater than zero',
      });
    }
    if (parseMoney(requestedAmount) !== parseMoney(refundable.refundableAmount)) {
      throw new BadRequestException({
        code: REFUND_FULL_AMOUNT_REQUIRED,
        message: 'Partial refunds are not supported in this version; use the full refundable amount',
      });
    }

    const resolution = await this.providerResolver.resolve(params.order);
    const now = new Date();
    const refId = await generateUniqueRefId('refund', (candidate) =>
      this.refundRequestsRepository.existsByRefId(candidate),
    );
    const merchantRefundReference = `RFN${refId}`;

    const created = await this.dataSource.transaction(async (manager) => {
      const entity = await this.refundRequestsRepository.create(
        {
          refId,
          orderId: params.order.id,
          orderNumber: params.order.orderNumber,
          customerId: params.order.userId,
          paymentRequestId: resolution.paymentRequestId,
          reason: params.reason,
          reasonDetails: params.reasonDetails,
          requestedAmount,
          approvedAmount: null,
          currency: REFUND_CURRENCY,
          status: RefundRequestStatus.REQUESTED,
          originalPaymentMethod: params.order.paymentMethod,
          paymentProvider: resolution.paymentProvider,
          providerPaymentId: resolution.providerPaymentId,
          merchantRefundReference,
          requestedByType: params.actor.type,
          requestedById: params.actor.id,
          expectedCreditFrom: addWorkingDays(now, 5),
          expectedCreditTo: addWorkingDays(now, 7),
          createdBy: params.actor.email ?? params.actor.id,
          updatedBy: params.actor.email ?? params.actor.id,
        },
        manager,
      );
      await this.refundRequestsRepository.addHistory(
        {
          refundRequestId: entity.id,
          fromStatus: null,
          toStatus: RefundRequestStatus.REQUESTED,
          action: RefundHistoryAction.CREATED,
          comment: params.comment ?? params.reasonDetails,
          performedBy: params.actor.email ?? params.actor.id,
          performedByRole: params.actor.role ?? null,
          metadata: {
            paymentProvider: resolution.paymentProvider,
            identifiable: resolution.identifiable,
          },
        },
        manager,
      );
      return entity;
    });

    await this.audit(created, 'CREATED', params.actor);
    this.logger.log(
      {
        refundRequestId: created.id,
        refundRequestRefId: created.refId,
        orderNumber: created.orderNumber,
        paymentProvider: created.paymentProvider,
      },
      'Refund request created; provider refund not initiated',
    );
    return created;
  }

  private async transition(params: {
    idOrRefId: string;
    actor: RefundActor;
    toStatus: RefundRequestStatus;
    action: RefundHistoryAction;
    comment?: string;
    patch: (entity: RefundRequestEntity) => Partial<RefundRequestEntity>;
  }): Promise<IRefundRequestDetail> {
    return this.dataSource.transaction(async (manager) => {
      const locked = await this.lockOrThrow(params.idOrRefId, manager);
      if (!canTransitionRefundStatus(locked.status, params.toStatus)) {
        throw new BadRequestException({
          code: REFUND_INVALID_STATUS_TRANSITION,
          message: `Cannot move refund from ${locked.status} to ${params.toStatus}`,
        });
      }
      const previousStatus = locked.status;
      await this.applyStatusChange(manager, locked, params.toStatus, params.patch(locked));
      await this.writeHistory(manager, { ...locked, status: previousStatus }, params.toStatus, params.action, params.actor, params.comment);
      await this.audit(locked, params.action, params.actor);
      const reloaded = await this.refundRequestsRepository.findById(locked.id, manager);
      return this.toDetail(reloaded ?? locked, params.actor);
    });
  }

  private async applyProviderResult(
    manager: EntityManager,
    locked: RefundRequestEntity,
    result: {
      providerRefundId: string | null;
      providerStatus: string;
      completed: boolean;
      failed: boolean;
      uncertain: boolean;
      responseReference: string | null;
      failureCode?: string;
      failureMessage?: string;
    },
    actor: RefundActor,
    action: RefundHistoryAction,
  ): Promise<void> {
    if (locked.status === RefundRequestStatus.PROCESSED || locked.status === RefundRequestStatus.CLOSED) {
      return;
    }

    const patch: Partial<RefundRequestEntity> = {
      providerRefundId: result.providerRefundId ?? locked.providerRefundId,
      providerRefundStatus: result.providerStatus,
      providerResponseReference: result.responseReference ?? locked.providerResponseReference,
      updatedBy: actor.email ?? actor.id,
    };

    const previousStatus = locked.status;

    if (result.completed) {
      await this.applyStatusChange(manager, locked, RefundRequestStatus.PROCESSED, {
        ...patch,
        processedAt: new Date(),
        failureCode: null,
        failureMessage: null,
      });
      await this.writeHistory(
        manager,
        { ...locked, status: previousStatus },
        RefundRequestStatus.PROCESSED,
        RefundHistoryAction.PROCESSED,
        actor,
      );
      await this.eventEmitter.emitAsync(EVENTS.REFUND_PROCESSED, { refundRequestId: locked.id });
      return;
    }

    if (result.failed) {
      await this.applyStatusChange(manager, locked, RefundRequestStatus.FAILED, {
        ...patch,
        failedAt: new Date(),
        failureCode: result.failureCode ?? 'REFUND_PROVIDER_REQUEST_FAILED',
        failureMessage: result.failureMessage ?? result.providerStatus,
      });
      await this.writeHistory(
        manager,
        { ...locked, status: previousStatus },
        RefundRequestStatus.FAILED,
        RefundHistoryAction.FAILED,
        actor,
      );
      await this.eventEmitter.emitAsync(EVENTS.REFUND_FAILED, { refundRequestId: locked.id });
      return;
    }

    await this.refundRequestsRepository.updateById(locked.id, patch, manager);
    await this.writeHistory(
      manager,
      { ...locked, status: previousStatus },
      previousStatus,
      action,
      actor,
      result.failureMessage,
    );
  }

  private async applyStatusChange(
    manager: EntityManager,
    locked: RefundRequestEntity,
    toStatus: RefundRequestStatus,
    extra: Partial<RefundRequestEntity>,
  ): Promise<void> {
    if (locked.status !== toStatus && !canTransitionRefundStatus(locked.status, toStatus)) {
      throw new BadRequestException({
        code: REFUND_INVALID_STATUS_TRANSITION,
        message: `Cannot move refund from ${locked.status} to ${toStatus}`,
      });
    }
    await this.refundRequestsRepository.updateById(
      locked.id,
      { status: toStatus, ...extra },
      manager,
    );
    locked.status = toStatus;
  }

  private async writeHistory(
    manager: EntityManager,
    locked: RefundRequestEntity,
    toStatus: RefundRequestStatus,
    action: RefundHistoryAction,
    actor: RefundActor,
    comment?: string | null,
  ): Promise<void> {
    await this.refundRequestsRepository.addHistory(
      {
        refundRequestId: locked.id,
        fromStatus: locked.status,
        toStatus,
        action,
        comment: comment ?? null,
        performedBy: actor.email ?? actor.id,
        performedByRole: actor.role ?? null,
        metadata: null,
      },
      manager,
    );
  }

  private async lockOrThrow(idOrRefId: string, manager: EntityManager): Promise<RefundRequestEntity> {
    const found = await this.refundRequestsRepository.findByIdOrRefId(idOrRefId, manager);
    if (!found) {
      throw new NotFoundException({
        code: REFUND_REQUEST_NOT_FOUND,
        message: 'Refund request not found',
      });
    }
    const locked = await this.refundRequestsRepository.lockById(found.id, manager);
    if (!locked) {
      throw new NotFoundException({
        code: REFUND_REQUEST_NOT_FOUND,
        message: 'Refund request not found',
      });
    }
    return locked;
  }

  private async requireRequest(idOrRefId: string): Promise<RefundRequestEntity> {
    const entity = await this.refundRequestsRepository.findByIdOrRefId(idOrRefId);
    if (!entity) {
      throw new NotFoundException({
        code: REFUND_REQUEST_NOT_FOUND,
        message: 'Refund request not found',
      });
    }
    return entity;
  }

  private async requireOrder(orderId: string, manager?: EntityManager): Promise<OrderEntity> {
    const repo = manager?.getRepository(OrderEntity) ?? this.dataSource.getRepository(OrderEntity);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId);
    const order = await repo.findOne({
      where: isUuid ? { id: orderId } : { refId: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private async toDetail(
    entity: RefundRequestEntity,
    _actor: RefundActor,
  ): Promise<IRefundRequestDetail> {
    const full = (await this.refundRequestsRepository.findById(entity.id)) ?? entity;
    const order = await this.requireOrder(full.orderId);
    const refundable = await this.amountService.calculateRefundableAmount(order, full.id);
    return mapRefundRequestToDetail(full, refundable, buildAvailableActions(full.status));
  }

  private async audit(
    entity: RefundRequestEntity,
    action: string,
    actor: RefundActor,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      entityType: 'refund_request',
      entityId: entity.id,
      entityRefId: entity.refId,
      action,
      performedBy: actor.email ?? actor.id,
      details: details ?? { status: entity.status },
    });
  }

  private isDuplicateActive(error: unknown): boolean {
    const driver = error as { code?: string; driverError?: { code?: string } };
    return driver.code === '23505' || driver.driverError?.code === '23505';
  }
}
