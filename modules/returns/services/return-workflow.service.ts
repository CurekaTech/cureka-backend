import { AuditEntityType } from '@modules/master/constants/audit-entity-type.constant';
import { AuditService } from '@modules/master/services/audit.service';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { RefundRequestsService } from '@modules/refund-requests/services/refund-request.service';
import { RefundRequestsRepository } from '@modules/refund-requests/repositories/refund-requests.repository';
import { RefundRequestedByType } from '@modules/refund-requests/enums/refund-requested-by-type.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
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
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  INVALID_STATUS_TRANSITION,
  RETURN_ALREADY_REPLACED,
  RETURN_NO_PICKUP_NOT_ALLOWED,
  RETURN_PICKUP_NOT_FOUND,
  RETURN_PICKUP_NOT_REQUIRED,
  RETURN_QC_NOT_ALLOWED,
  RETURN_QC_QUANTITY_INVALID,
  RETURN_REFUND_ALREADY_CREATED,
  RETURN_REFUND_NOT_APPLICABLE,
  RETURN_REPLACEMENT_NOT_CONFIGURED,
  RETURN_REQUEST_NOT_FOUND,
} from '../constants/return.constants';
import {
  ApproveNoPickupDto,
  ApproveReturnRequestDto,
  AssignReturnRequestDto,
  LinkReplacementOrderDto,
  ReceiveAtWarehouseDto,
  RejectReturnRequestDto,
  RequestAdditionalInformationDto,
  ReturnCommentDto,
  ReturnListQueryDto,
  SchedulePickupDto,
  SubmitQcDto,
  UpdatePickupStatusDto,
} from '../dto/return-request.dto';
import { ReturnHistoryAction } from '../enums/return-history-action.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnQcResult } from '../enums/return-qc-result.enum';
import { ReturnRequestedByType } from '../enums/return-requested-by-type.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { ReturnRequestEntity } from '../entities/return-request.entity';
import {
  IReturnRefundLinkView,
  IReturnRequestDetail,
  IReturnRequestListItem,
  ReturnActor,
} from '../interfaces/return-request.interface';
import { mapReturnToDetail, mapReturnToListItem } from '../mappers/return-request.mapper';
import { ReturnEvidencesRepository } from '../repositories/return-evidences.repository';
import { ReturnPickupsRepository } from '../repositories/return-pickups.repository';
import { ReturnQcRecordsRepository } from '../repositories/return-qc-records.repository';
import { ReturnRequestsRepository } from '../repositories/return-requests.repository';
import { canTransitionReturnStatus } from '../utils/return-status-transition.util';
import { ReturnPickupService } from './return-pickup.service';
import { mapShipwayStatusToReturnPickupStatus } from '../utils/shipway-return-pickup-status.util';

@Injectable()
export class ReturnWorkflowService {
  private readonly logger = new Logger(ReturnWorkflowService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly returnRequestsRepository: ReturnRequestsRepository,
    private readonly evidencesRepository: ReturnEvidencesRepository,
    private readonly pickupsRepository: ReturnPickupsRepository,
    private readonly qcRecordsRepository: ReturnQcRecordsRepository,
    private readonly pickupService: ReturnPickupService,
    private readonly refundRequestsService: RefundRequestsService,
    private readonly refundRequestsRepository: RefundRequestsRepository,
    private readonly auditService: AuditService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(OrderEntity)
    private readonly ordersRepository: Repository<OrderEntity>,
    @InjectRepository(ProductVariantEntity)
    private readonly variantsRepository: Repository<ProductVariantEntity>,
  ) {}

  // ── Reads ─────────────────────────────────────────────────────────────────

  async list(query: ReturnListQueryDto): Promise<PaginatedResult<IReturnRequestListItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.returnRequestsRepository.findAllPaginated({
      ...pagination,
      status: query.status,
      resolution: query.resolution,
      orderId: query.orderId,
      orderNumber: query.orderNumber,
      returnNumber: query.returnNumber,
      customerId: query.customerId,
      reasonId: query.reasonId,
      sku: query.sku,
      productId: query.productId,
      assignedTo: query.assignedTo,
      pickupRequired: query.pickupRequired,
      qcRequired: query.qcRequired,
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      deliveredFrom: query.deliveredFrom ? new Date(query.deliveredFrom) : undefined,
      deliveredTo: query.deliveredTo ? new Date(query.deliveredTo) : undefined,
      slaStatus: query.slaStatus,
    });
    return buildPaginatedResult(data.map((item) => mapReturnToListItem(item)), total, pagination);
  }

  async getDetail(identifier: string): Promise<IReturnRequestDetail> {
    const request = await this.requireReturn(identifier);
    const [evidence, pickups, qcRecords] = await Promise.all([
      this.evidencesRepository.findByReturnRequestId(request.id),
      this.pickupsRepository.findByReturnRequestId(request.id),
      this.qcRecordsRepository.findByReturnRequestId(request.id),
    ]);
    const detail = mapReturnToDetail(request, {
      evidence,
      pickups,
      qcRecords,
      refund: await this.buildRefundLink(request),
    });
    return this.storageUrlEnricher.enrichDeep(detail);
  }

  // ── Review ────────────────────────────────────────────────────────────────

  review(identifier: string, dto: ReturnCommentDto, actor: ReturnActor) {
    return this.transition({
      identifier,
      actor,
      toStatus: ReturnStatus.UNDER_REVIEW,
      action: ReturnHistoryAction.REVIEWED,
      comment: dto.comment,
      customerVisible: false,
      patch: () => ({ reviewedBy: actor.id, reviewedAt: new Date() }),
    });
  }

  async approve(identifier: string, dto: ApproveReturnRequestDto, actor: ReturnActor) {
    const current = await this.requireReturn(identifier);
    const pickupRequired = dto.pickupRequired ?? current.pickupRequired;
    const qcRequired = dto.qcRequired ?? current.qcRequired;

    const detail = await this.transition({
      identifier,
      actor,
      toStatus: ReturnStatus.APPROVED,
      action: ReturnHistoryAction.APPROVED,
      comment: dto.comment,
      customerVisible: true,
      patch: (entity) => ({
        approvedBy: actor.id,
        approvedAt: new Date(),
        pickupRequired,
        qcRequired,
        bankDetailsLocked: true,
        // Approval commits the estimate as the amount the refund will use.
        approvedRefundAmount:
          entity.resolution === ReturnResolution.REFUND ? entity.estimatedRefundAmount : null,
      }),
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_REQUEST_APPROVED, {
      returnRequestId: current.id,
      returnNumber: current.returnNumber,
      orderId: current.orderId,
      customerId: current.customerId,
      pickupRequired,
    });

    if (!pickupRequired) {
      return this.moveToResolutionPending(current.id, actor);
    }

    if (this.configService.get<boolean>('returns.pickup.autoScheduleOnApprove') === false) {
      return detail;
    }

    try {
      return await this.schedulePickup(current.id, {}, actor);
    } catch (error) {
      this.logger.warn(
        {
          returnRequestId: current.id,
          returnNumber: current.returnNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        'Auto reverse-pickup after approval failed — return stays APPROVED for retry',
      );
      return this.getDetail(current.id);
    }
  }

  async reject(identifier: string, dto: RejectReturnRequestDto, actor: ReturnActor) {
    const detail = await this.transition({
      identifier,
      actor,
      toStatus: ReturnStatus.REJECTED,
      action: ReturnHistoryAction.REJECTED,
      comment: dto.reason,
      customerVisible: true,
      patch: () => ({
        rejectedBy: actor.id,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
        internalJustification: dto.internalNote?.trim() ?? null,
      }),
    });
    await this.eventEmitter.emitAsync(EVENTS.RETURN_REQUEST_REJECTED, {
      returnRequestId: detail.id,
      returnNumber: detail.returnNumber,
      orderId: detail.orderId,
      customerId: detail.customer.id,
      reason: dto.reason,
    });
    return detail;
  }

  async requestAdditionalInformation(
    identifier: string,
    dto: RequestAdditionalInformationDto,
    actor: ReturnActor,
  ) {
    const detail = await this.transition({
      identifier,
      actor,
      toStatus: ReturnStatus.ADDITIONAL_INFORMATION_REQUIRED,
      action: ReturnHistoryAction.ADDITIONAL_INFORMATION_REQUESTED,
      comment: dto.message,
      customerVisible: true,
      patch: () => ({
        informationRequestedAt: new Date(),
        informationRequestMessage: dto.message,
      }),
    });
    await this.eventEmitter.emitAsync(EVENTS.RETURN_INFORMATION_REQUESTED, {
      returnRequestId: detail.id,
      returnNumber: detail.returnNumber,
      customerId: detail.customer.id,
      message: dto.message,
    });
    return detail;
  }

  async assign(identifier: string, dto: AssignReturnRequestDto, actor: ReturnActor) {
    if (!dto.assignedToUserId && !dto.assignedRoleId) {
      throw new BadRequestException('assignedToUserId or assignedRoleId is required');
    }
    const request = await this.requireReturn(identifier);
    await this.returnRequestsRepository.updateById(request.id, {
      assignedToUserId: dto.assignedToUserId ?? request.assignedToUserId,
      assignedRoleId: dto.assignedRoleId ?? request.assignedRoleId,
      updatedBy: actor.email ?? actor.id,
    });
    await this.returnRequestsRepository.addHistory({
      returnRequestId: request.id,
      fromStatus: request.status,
      toStatus: request.status,
      action: ReturnHistoryAction.ASSIGNED,
      comment: dto.comment?.trim() ?? null,
      isCustomerVisible: false,
      performedBy: actor.email ?? actor.id,
      performedByRole: actor.role ?? null,
      metadata: {
        assignedToUserId: dto.assignedToUserId ?? null,
        assignedRoleId: dto.assignedRoleId ?? null,
      },
    });
    await this.audit(request, ReturnHistoryAction.ASSIGNED, actor, {
      assignedToUserId: dto.assignedToUserId ?? null,
    });
    return this.getDetail(request.id);
  }

  async addComment(
    identifier: string,
    dto: ReturnCommentDto,
    actor: ReturnActor,
    isInternal: boolean,
  ) {
    if (!dto.comment?.trim()) {
      throw new BadRequestException('comment is required');
    }
    const request = await this.requireReturn(identifier);
    await this.returnRequestsRepository.addHistory({
      returnRequestId: request.id,
      fromStatus: request.status,
      toStatus: request.status,
      action: isInternal
        ? ReturnHistoryAction.INTERNAL_NOTE_ADDED
        : ReturnHistoryAction.COMMENT_ADDED,
      comment: dto.comment.trim(),
      isCustomerVisible: !isInternal,
      performedBy: actor.email ?? actor.id,
      performedByRole: actor.role ?? null,
      metadata: null,
    });
    return this.getDetail(request.id);
  }

  // ── Pickup ────────────────────────────────────────────────────────────────

  async schedulePickup(identifier: string, dto: SchedulePickupDto, actor: ReturnActor) {
    const request = await this.requireReturn(identifier);
    if (!request.pickupRequired) {
      throw new BadRequestException({
        code: RETURN_PICKUP_NOT_REQUIRED,
        message: 'This return does not require a pickup',
      });
    }

    const order = await this.ordersRepository.findOne({
      where: { id: request.orderId },
      relations: { items: true, user: true },
    });

    const existingPickup = await this.pickupsRepository.findActiveByReturnRequestId(request.id);
    if (existingPickup?.status === ReturnPickupStatus.SCHEDULED && existingPickup.reverseAwbNumber) {
      throw new BadRequestException({
        code: 'RETURN_PICKUP_ALREADY_BOOKED',
        message: 'A reverse courier pickup is already booked for this return',
      });
    }

    const provider = dto.provider ?? this.pickupService.defaultProvider();
    const result = await this.pickupService.schedule(provider, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      orderNumber: request.orderNumber,
      reason: request.reasonTitle,
      resolution: request.resolution,
      pickupAddress: request.pickupAddress,
      customerEmail: order?.user?.email ?? request.customer?.email ?? null,
      items: (request.items ?? []).map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        productName: item.productName,
        unitPrice: item.unitPrice,
        replacementSku: item.replacementSku,
      })),
      originalOrderItems: (order?.items ?? []).map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
      })),
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      manual: {
        reverseAwbNumber: dto.reverseAwbNumber ?? null,
        courierName: dto.courierName ?? null,
        trackingUrl: dto.trackingUrl ?? null,
      },
      existing: existingPickup
        ? {
            unicommerceReversePickupCode: existingPickup.unicommerceReversePickupCode,
            shipwayOrderId: existingPickup.shipwayOrderId,
            reverseAwbNumber: existingPickup.reverseAwbNumber,
          }
        : undefined,
    });

    const courierBooked = result.courierBooked === true || Boolean(result.reverseAwbNumber);
    const pickupFields = {
      provider: result.provider,
      status: result.status,
      providerPickupId: result.providerPickupId,
      reverseAwbNumber: result.reverseAwbNumber,
      courierName: result.courierName,
      trackingUrl: result.trackingUrl,
      scheduledAt: result.scheduledAt,
      failureReason: result.failureReason ?? null,
      providerPayload: result.providerPayload,
      unicommerceReversePickupCode: result.unicommerceReversePickupCode ?? null,
      shipwayOrderId: result.shipwayOrderId ?? null,
      unicommerceSyncStatus: result.unicommerceSyncStatus ?? null,
      shipwayBookingStatus: result.shipwayBookingStatus ?? null,
      updatedBy: actor.email ?? actor.id,
    };

    if (!courierBooked) {
      await this.dataSource.transaction(async (manager) => {
        if (existingPickup) {
          await this.pickupsRepository.updateById(existingPickup.id, pickupFields, manager);
        } else {
          await this.pickupsRepository.create(
            {
              refId: await generateUniqueRefId('returnpickup', (candidate) =>
                this.pickupsRepository.existsByRefId(candidate),
              ),
              returnRequestId: request.id,
              ...pickupFields,
              createdBy: actor.email ?? actor.id,
            },
            manager,
          );
        }
        const locked = await this.returnRequestsRepository.lockById(request.id, manager);
        if (locked) {
          await this.writeHistory(manager, locked, locked.status, {
            action: ReturnHistoryAction.PICKUP_UPDATED,
            comment: result.failureReason ?? 'Courier pickup was not booked',
            customerVisible: false,
            actor,
            metadata: {
              courierBooked: false,
              unicommerceRecorded: result.unicommerceRecorded === true,
              uncertainBooking: result.uncertainBooking === true,
            },
          });
        }
      });
      return this.getDetail(request.id);
    }

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(manager, request.id, ReturnStatus.PICKUP_SCHEDULED);
      if (existingPickup) {
        await this.pickupsRepository.updateById(existingPickup.id, pickupFields, manager);
      } else {
        await this.pickupsRepository.create(
          {
            refId: await generateUniqueRefId('returnpickup', (candidate) =>
              this.pickupsRepository.existsByRefId(candidate),
            ),
            returnRequestId: request.id,
            ...pickupFields,
            createdBy: actor.email ?? actor.id,
          },
          manager,
        );
      }
      await this.applyStatus(manager, locked, ReturnStatus.PICKUP_SCHEDULED, {
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, locked, ReturnStatus.PICKUP_SCHEDULED, {
        action: ReturnHistoryAction.PICKUP_SCHEDULED,
        comment: dto.comment?.trim() ?? null,
        customerVisible: true,
        actor,
        metadata: { provider: result.provider, reverseAwbNumber: result.reverseAwbNumber },
      });
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_PICKUP_SCHEDULED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      customerId: request.customerId,
      reverseAwbNumber: result.reverseAwbNumber,
    });
    return this.getDetail(request.id);
  }

  async updatePickupStatus(identifier: string, dto: UpdatePickupStatusDto, actor: ReturnActor) {
    const request = await this.requireReturn(identifier);
    const pickup = await this.pickupsRepository.findActiveByReturnRequestId(request.id);
    if (!pickup) {
      throw new NotFoundException({
        code: RETURN_PICKUP_NOT_FOUND,
        message: 'No active pickup exists for this return',
      });
    }

    const eventAt = dto.eventAt ? new Date(dto.eventAt) : new Date();
    const nextReturnStatus = PICKUP_STATUS_TO_RETURN_STATUS[dto.status];

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.returnRequestsRepository.lockById(request.id, manager);
      if (!locked) {
        throw new NotFoundException({
          code: RETURN_REQUEST_NOT_FOUND,
          message: 'Return request not found',
        });
      }

      await this.pickupsRepository.updateById(
        pickup.id,
        {
          status: dto.status,
          lastEventAt: eventAt,
          lastEventStatus: dto.status,
          failureReason: dto.failureReason?.trim() ?? pickup.failureReason,
          attemptCount:
            dto.status === ReturnPickupStatus.ATTEMPTED
              ? pickup.attemptCount + 1
              : pickup.attemptCount,
          pickedUpAt:
            dto.status === ReturnPickupStatus.PICKED_UP ? eventAt : pickup.pickedUpAt,
          deliveredAtWarehouseAt:
            dto.status === ReturnPickupStatus.DELIVERED_TO_WAREHOUSE
              ? eventAt
              : pickup.deliveredAtWarehouseAt,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );

      if (nextReturnStatus && canTransitionReturnStatus(locked.status, nextReturnStatus)) {
        await this.applyStatus(manager, locked, nextReturnStatus, {
          pickedUpAt:
            nextReturnStatus === ReturnStatus.PICKED_UP ? eventAt : locked.pickedUpAt,
          receivedAtWarehouseAt:
            nextReturnStatus === ReturnStatus.RECEIVED_AT_WAREHOUSE
              ? eventAt
              : locked.receivedAtWarehouseAt,
          updatedBy: actor.email ?? actor.id,
        });
        await this.writeHistory(manager, locked, nextReturnStatus, {
          action:
            nextReturnStatus === ReturnStatus.PICKED_UP
              ? ReturnHistoryAction.PICKED_UP
              : ReturnHistoryAction.PICKUP_UPDATED,
          comment: dto.comment?.trim() ?? null,
          customerVisible: true,
          actor,
          metadata: { pickupStatus: dto.status },
        });
      } else {
        await this.writeHistory(manager, locked, locked.status, {
          action: ReturnHistoryAction.PICKUP_UPDATED,
          comment: dto.comment?.trim() ?? null,
          customerVisible: true,
          actor,
          metadata: { pickupStatus: dto.status },
        });
      }
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_PICKUP_UPDATED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      customerId: request.customerId,
      pickupStatus: dto.status,
    });
    return this.getDetail(request.id);
  }

  /**
   * Applies an inbound Shipway webhook to a reverse pickup. Matched by the
   * reverse order id (Cureka return number) or reverse AWB. Idempotent.
   */
  async applyShipwayTrackingEvent(event: {
    orderId?: string | null;
    awbNumber?: string | null;
    status?: string | null;
    statusCode?: string | null;
    eventId?: string | null;
    trackingUrl?: string | null;
    courierName?: string | null;
    statusDate?: string | null;
  }): Promise<boolean> {
    const orderId = event.orderId?.trim() || null;
    const awb = event.awbNumber?.trim() || null;
    if (!orderId && !awb) return false;

    const pickup = orderId
      ? await this.pickupsRepository.findByProviderPickupId(orderId)
      : null;
    const matched =
      pickup ?? (awb ? await this.pickupsRepository.findByReverseAwbNumber(awb) : null);
    if (!matched) return false;

    const eventKey =
      event.eventId?.trim() || `${orderId ?? awb}:${event.statusCode ?? event.status ?? ''}`;
    if (matched.lastEventKey === eventKey) {
      return true;
    }

    const pickupStatus = mapShipwayStatusToReturnPickupStatus(event.status, event.statusCode);
    const systemActor: ReturnActor = {
      id: 'SYSTEM',
      email: 'system@cureka',
      role: 'SYSTEM',
      type: ReturnRequestedByType.ADMIN,
    };

    if (pickupStatus) {
      await this.updatePickupStatus(
        matched.returnRequestId,
        {
          status: pickupStatus,
          eventAt: event.statusDate ?? undefined,
          comment: event.status ?? event.statusCode ?? undefined,
        },
        systemActor,
      );
    }

    await this.pickupsRepository.updateById(matched.id, {
      lastEventKey: eventKey,
      lastEventAt: new Date(),
      lastEventStatus: event.status ?? event.statusCode ?? matched.lastEventStatus,
      trackingUrl: event.trackingUrl ?? matched.trackingUrl,
      courierName: event.courierName ?? matched.courierName,
      reverseAwbNumber: awb ?? matched.reverseAwbNumber,
    });
    return true;
  }

  /**
   * Resolves a return without collecting the item, e.g. a low-value or hazardous
   * SKU. Only allowed when the captured policy says so, and always audited.
   */
  async approveNoPickup(identifier: string, dto: ApproveNoPickupDto, actor: ReturnActor) {
    const request = await this.requireReturn(identifier);
    if (!request.pickupRequired) {
      throw new BadRequestException({
        code: RETURN_PICKUP_NOT_REQUIRED,
        message: 'This return is already marked as not requiring a pickup',
      });
    }
    const allowed = (request.items ?? []).every(
      (item) => item.policySnapshot?.noPickupRefundAllowed === true,
    );
    if (!allowed) {
      throw new BadRequestException({
        code: RETURN_NO_PICKUP_NOT_ALLOWED,
        message:
          'The captured product policy for one or more items requires the item to be collected',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.returnRequestsRepository.lockById(request.id, manager);
      if (!locked) {
        throw new NotFoundException({
          code: RETURN_REQUEST_NOT_FOUND,
          message: 'Return request not found',
        });
      }
      await this.returnRequestsRepository.updateById(
        request.id,
        {
          pickupRequired: false,
          qcRequired: false,
          noPickupApproved: true,
          noPickupApprovedBy: actor.id,
          internalJustification: dto.justification,
          customerVisibleExplanation: dto.customerVisibleExplanation?.trim() ?? null,
          updatedBy: actor.email ?? actor.id,
        },
        manager,
      );
      await this.writeHistory(manager, locked, locked.status, {
        action: ReturnHistoryAction.NO_PICKUP_APPROVED,
        comment: dto.justification,
        customerVisible: false,
        actor,
        metadata: null,
      });
    });

    await this.audit(request, ReturnHistoryAction.NO_PICKUP_APPROVED, actor, {
      justification: dto.justification,
    });
    return this.moveToResolutionPending(request.id, actor);
  }

  // ── Warehouse and QC ──────────────────────────────────────────────────────

  async receiveAtWarehouse(
    identifier: string,
    dto: ReceiveAtWarehouseDto,
    actor: ReturnActor,
  ) {
    const request = await this.requireReturn(identifier);
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(
        manager,
        request.id,
        ReturnStatus.RECEIVED_AT_WAREHOUSE,
      );
      await this.applyStatus(manager, locked, ReturnStatus.RECEIVED_AT_WAREHOUSE, {
        receivedAtWarehouseAt: receivedAt,
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, locked, ReturnStatus.RECEIVED_AT_WAREHOUSE, {
        action: ReturnHistoryAction.RECEIVED_AT_WAREHOUSE,
        comment: dto.comment?.trim() ?? null,
        customerVisible: true,
        actor,
        metadata: null,
      });
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_RECEIVED_AT_WAREHOUSE, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      customerId: request.customerId,
    });

    const reloaded = await this.requireReturn(request.id);
    if (reloaded.qcRequired) {
      return this.transitionEntity(reloaded, ReturnStatus.QC_PENDING, {
        action: ReturnHistoryAction.RECEIVED_AT_WAREHOUSE,
        comment: 'Awaiting quality check',
        customerVisible: true,
        actor,
      });
    }
    return this.moveToResolutionPending(request.id, actor);
  }

  async submitQc(identifier: string, dto: SubmitQcDto, actor: ReturnActor) {
    const request = await this.requireReturn(identifier);
    if (request.status !== ReturnStatus.QC_PENDING) {
      throw new BadRequestException({
        code: RETURN_QC_NOT_ALLOWED,
        message: 'Quality check can only be submitted while the return is awaiting QC',
      });
    }

    const itemsById = new Map((request.items ?? []).map((item) => [item.id, item]));
    for (const line of dto.items) {
      const item = itemsById.get(line.returnRequestItemId);
      if (!item) {
        throw new NotFoundException({
          code: RETURN_QC_QUANTITY_INVALID,
          message: 'One or more QC lines do not belong to this return',
        });
      }
      if (line.receivedQuantity > item.quantity || line.acceptedQuantity > line.receivedQuantity) {
        throw new BadRequestException({
          code: RETURN_QC_QUANTITY_INVALID,
          message: `Invalid quantities for ${item.sku}`,
        });
      }
      if (line.acceptedQuantity < line.receivedQuantity && !line.rejectionReason?.trim()) {
        throw new BadRequestException({
          code: RETURN_QC_QUANTITY_INVALID,
          message: `A rejection reason is required for ${item.sku}`,
        });
      }
    }

    const totalAccepted = dto.items.reduce((sum, line) => sum + line.acceptedQuantity, 0);
    const totalReceived = dto.items.reduce((sum, line) => sum + line.receivedQuantity, 0);
    const overallResult =
      totalAccepted === 0
        ? ReturnQcResult.FAIL
        : totalAccepted === totalReceived
          ? ReturnQcResult.PASS
          : ReturnQcResult.PARTIAL;
    const nextStatus =
      overallResult === ReturnQcResult.FAIL ? ReturnStatus.QC_FAILED : ReturnStatus.QC_PASSED;
    const performedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(manager, request.id, nextStatus);

      await this.qcRecordsRepository.createMany(
        await Promise.all(
          dto.items.map(async (line) => ({
            refId: await generateUniqueRefId('returnqc', (candidate) =>
              this.qcRecordsRepository.existsByRefId(candidate),
            ),
            returnRequestId: request.id,
            returnRequestItemId: line.returnRequestItemId,
            result:
              line.acceptedQuantity === 0
                ? ReturnQcResult.FAIL
                : line.acceptedQuantity === line.receivedQuantity
                  ? ReturnQcResult.PASS
                  : ReturnQcResult.PARTIAL,
            receivedQuantity: line.receivedQuantity,
            acceptedQuantity: line.acceptedQuantity,
            rejectedQuantity: line.receivedQuantity - line.acceptedQuantity,
            rejectionReason: line.rejectionReason?.trim() ?? null,
            notes: line.notes?.trim() ?? null,
            performedBy: actor.email ?? actor.id,
            performedAt,
            warehouseReceivedAt: locked.receivedAtWarehouseAt,
            createdBy: actor.email ?? actor.id,
            updatedBy: actor.email ?? actor.id,
          })),
        ),
        manager,
      );

      for (const line of dto.items) {
        await this.returnRequestsRepository.updateItemById(
          line.returnRequestItemId,
          {
            acceptedQuantity: line.acceptedQuantity,
            rejectedQuantity: line.receivedQuantity - line.acceptedQuantity,
            qcRejectionReason: line.rejectionReason?.trim() ?? null,
            updatedBy: actor.email ?? actor.id,
          },
          manager,
        );
      }

      // Partial acceptance reduces the refundable amount to the accepted units so
      // a customer is never paid for stock the warehouse did not take back.
      const approvedRefundAmount = this.recalculateAcceptedAmount(request, dto);

      await this.applyStatus(manager, locked, nextStatus, {
        qcCompletedAt: performedAt,
        approvedRefundAmount:
          locked.resolution === ReturnResolution.REFUND ? approvedRefundAmount : null,
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, locked, nextStatus, {
        action: ReturnHistoryAction.QC_SUBMITTED,
        comment: dto.comment?.trim() ?? null,
        customerVisible: true,
        actor,
        metadata: { result: overallResult, totalAccepted, totalReceived },
      });

      if (nextStatus === ReturnStatus.QC_PASSED) {
        await this.restockAcceptedUnits(manager, request.id, dto, actor);
      }
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_QC_COMPLETED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      customerId: request.customerId,
      result: overallResult,
    });
    await this.audit(request, ReturnHistoryAction.QC_SUBMITTED, actor, {
      result: overallResult,
      totalAccepted,
      totalReceived,
    });

    if (nextStatus === ReturnStatus.QC_FAILED) {
      return this.getDetail(request.id);
    }
    return this.moveToResolutionPending(request.id, actor);
  }

  // ── Refund and replacement handoff ────────────────────────────────────────

  /**
   * Hands the return to the existing refund workflow.
   *
   * The refund is created in its own REQUESTED state and still needs the normal
   * finance approval and initiation — creating it here never moves money.
   */
  async createRefund(identifier: string, dto: ReturnCommentDto, actor: ReturnActor) {
    const request = await this.requireReturn(identifier);
    if (request.resolution !== ReturnResolution.REFUND) {
      throw new BadRequestException({
        code: RETURN_REFUND_NOT_APPLICABLE,
        message: 'This return is being resolved as a replacement',
      });
    }
    if (request.refundRequestId) {
      throw new ConflictException({
        code: RETURN_REFUND_ALREADY_CREATED,
        message: 'A refund has already been created for this return',
      });
    }
    if (request.status !== ReturnStatus.REFUND_PENDING) {
      throw new BadRequestException({
        code: INVALID_STATUS_TRANSITION,
        message: 'The return must reach the refund-pending stage before a refund is created',
      });
    }

    const amount = request.approvedRefundAmount ?? request.estimatedRefundAmount;
    if (parseMoney(amount) <= 0) {
      throw new BadRequestException({
        code: RETURN_REFUND_NOT_APPLICABLE,
        message: 'There is no refundable amount left for this return',
      });
    }

    const order = await this.ordersRepository.findOne({
      where: { id: request.orderId },
      relations: { items: true },
    });
    if (!order) {
      throw new NotFoundException({
        code: RETURN_REQUEST_NOT_FOUND,
        message: 'Order not found for this return',
      });
    }

    const refund = await this.refundRequestsService.createFromReturn({
      order,
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      amount,
      reasonDetails: `Return ${request.returnNumber} — ${request.reasonTitle}`,
      actor: {
        id: actor.id,
        email: actor.email,
        role: actor.role,
        type: RefundRequestedByType.ADMIN,
      },
    });

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(manager, request.id, ReturnStatus.REFUND_INITIATED);
      await this.applyStatus(manager, locked, ReturnStatus.REFUND_INITIATED, {
        refundRequestId: refund.id,
        refundLinkedAt: new Date(),
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, locked, ReturnStatus.REFUND_INITIATED, {
        action: ReturnHistoryAction.REFUND_LINKED,
        comment: dto.comment?.trim() ?? null,
        customerVisible: true,
        actor,
        metadata: { refundRefId: refund.refId, amount },
      });
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_REFUND_LINKED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      refundRequestId: refund.id,
      amount,
    });
    await this.audit(request, ReturnHistoryAction.REFUND_LINKED, actor, {
      refundRefId: refund.refId,
      amount,
    });
    return this.getDetail(request.id);
  }

  async linkReplacementOrder(
    identifier: string,
    dto: LinkReplacementOrderDto,
    actor: ReturnActor,
  ) {
    const request = await this.requireReturn(identifier);
    if (request.resolution !== ReturnResolution.REPLACEMENT) {
      throw new BadRequestException({
        code: RETURN_REPLACEMENT_NOT_CONFIGURED,
        message: 'This return is being resolved as a refund',
      });
    }
    if (request.replacementOrderId) {
      throw new ConflictException({
        code: RETURN_ALREADY_REPLACED,
        message: 'A replacement order is already linked to this return',
      });
    }
    const replacement = await this.ordersRepository.findOne({
      where: { id: dto.replacementOrderId },
    });
    if (!replacement) {
      throw new NotFoundException({
        code: RETURN_REQUEST_NOT_FOUND,
        message: 'Replacement order not found',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(
        manager,
        request.id,
        ReturnStatus.REPLACEMENT_CREATED,
      );
      await this.applyStatus(manager, locked, ReturnStatus.REPLACEMENT_CREATED, {
        replacementOrderId: replacement.id,
        replacementLinkedAt: new Date(),
        updatedBy: actor.email ?? actor.id,
      });
      await this.writeHistory(manager, locked, ReturnStatus.REPLACEMENT_CREATED, {
        action: ReturnHistoryAction.REPLACEMENT_LINKED,
        comment: dto.comment?.trim() ?? null,
        customerVisible: true,
        actor,
        metadata: { replacementOrderNumber: replacement.orderNumber },
      });
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_REPLACEMENT_LINKED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      replacementOrderId: replacement.id,
    });
    return this.getDetail(request.id);
  }

  async complete(identifier: string, dto: ReturnCommentDto, actor: ReturnActor) {
    const detail = await this.transition({
      identifier,
      actor,
      toStatus: ReturnStatus.COMPLETED,
      action: ReturnHistoryAction.COMPLETED,
      comment: dto.comment,
      customerVisible: true,
      patch: () => ({ completedAt: new Date() }),
    });
    await this.eventEmitter.emitAsync(EVENTS.RETURN_COMPLETED, {
      returnRequestId: detail.id,
      returnNumber: detail.returnNumber,
      customerId: detail.customer.id,
    });
    return detail;
  }

  /**
   * Reacts to the linked refund reaching a terminal state. Called by the module
   * listener so the return closes itself instead of needing a second admin action.
   */
  async onLinkedRefundProcessed(refundRequestId: string): Promise<void> {
    const request = await this.returnRequestsRepository.findByRefundRequestId(refundRequestId);
    if (!request || request.status !== ReturnStatus.REFUND_INITIATED) {
      return;
    }
    const systemActor: ReturnActor = {
      id: 'SYSTEM',
      email: 'system@cureka',
      role: 'SYSTEM',
      type: request.requestedByType,
    };

    await this.dataSource.transaction(async (manager) => {
      const locked = await this.returnRequestsRepository.lockById(request.id, manager);
      if (!locked || locked.status !== ReturnStatus.REFUND_INITIATED) return;

      await this.applyStatus(manager, locked, ReturnStatus.REFUND_COMPLETED, {
        updatedBy: 'SYSTEM',
      });
      await this.writeHistory(manager, locked, ReturnStatus.REFUND_COMPLETED, {
        action: ReturnHistoryAction.REFUND_STATUS_UPDATED,
        comment: 'Refund completed',
        customerVisible: true,
        actor: systemActor,
        metadata: { refundRequestId },
      });

      const afterRefund = { ...locked, status: ReturnStatus.REFUND_COMPLETED };
      await this.applyStatus(manager, afterRefund, ReturnStatus.COMPLETED, {
        completedAt: new Date(),
        updatedBy: 'SYSTEM',
      });
      await this.writeHistory(manager, afterRefund, ReturnStatus.COMPLETED, {
        action: ReturnHistoryAction.COMPLETED,
        comment: null,
        customerVisible: true,
        actor: systemActor,
        metadata: null,
      });
    });

    await this.eventEmitter.emitAsync(EVENTS.RETURN_COMPLETED, {
      returnRequestId: request.id,
      returnNumber: request.returnNumber,
      customerId: request.customerId,
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async moveToResolutionPending(
    returnRequestId: string,
    actor: ReturnActor,
  ): Promise<IReturnRequestDetail> {
    const request = await this.requireReturn(returnRequestId);
    const next =
      request.resolution === ReturnResolution.REPLACEMENT
        ? ReturnStatus.REPLACEMENT_PENDING
        : ReturnStatus.REFUND_PENDING;

    if (!canTransitionReturnStatus(request.status, next)) {
      return this.getDetail(returnRequestId);
    }
    return this.transitionEntity(request, next, {
      action:
        next === ReturnStatus.REFUND_PENDING
          ? ReturnHistoryAction.REFUND_STATUS_UPDATED
          : ReturnHistoryAction.REPLACEMENT_LINKED,
      comment: null,
      customerVisible: true,
      actor,
    });
  }

  private recalculateAcceptedAmount(
    request: ReturnRequestEntity,
    dto: SubmitQcDto,
  ): string {
    const itemsById = new Map((request.items ?? []).map((item) => [item.id, item]));
    const total = dto.items.reduce((sum, line) => {
      const item = itemsById.get(line.returnRequestItemId);
      if (!item || item.quantity <= 0) return sum;
      const lineRefundable = parseMoney(item.refundableAmount);
      return sum + (lineRefundable * line.acceptedQuantity) / item.quantity;
    }, 0);
    return toMoneyString(roundMoney(total));
  }

  /**
   * Unicommerce is the fulfilment system of record, so restocking here is off by
   * default; enabling both would double-count returned stock.
   */
  private async restockAcceptedUnits(
    manager: EntityManager,
    returnRequestId: string,
    dto: SubmitQcDto,
    actor: ReturnActor,
  ): Promise<void> {
    if (!this.configService.get<boolean>('returns.inventory.restockOnQcPass')) {
      return;
    }
    const items = await this.returnRequestsRepository.findItemsByReturnRequestId(
      returnRequestId,
      manager,
    );
    const acceptedByItemId = new Map(
      dto.items.map((line) => [line.returnRequestItemId, line.acceptedQuantity]),
    );

    for (const item of items) {
      const accepted = acceptedByItemId.get(item.id) ?? 0;
      if (accepted <= 0) continue;
      await manager
        .getRepository(ProductVariantEntity)
        .increment({ id: item.variantId }, 'stock', accepted);
    }
    await this.returnRequestsRepository.updateById(
      returnRequestId,
      { inventoryRestored: true, updatedBy: actor.email ?? actor.id },
      manager,
    );
    this.logger.log({ returnRequestId }, 'Restored accepted return units to variant stock');
  }

  private async buildRefundLink(request: ReturnRequestEntity): Promise<IReturnRefundLinkView> {
    if (!request.refundRequestId) {
      return {
        refundRequestId: null,
        refundRefId: null,
        refundStatus: null,
        refundAmount: null,
        paymentProvider: null,
        linkedAt: null,
      };
    }
    const refund = await this.refundRequestsRepository.findById(request.refundRequestId);
    return {
      refundRequestId: request.refundRequestId,
      refundRefId: refund?.refId ?? null,
      refundStatus: refund?.status ?? null,
      refundAmount: refund?.approvedAmount ?? refund?.requestedAmount ?? null,
      paymentProvider: refund?.paymentProvider ?? null,
      linkedAt: request.refundLinkedAt,
    };
  }

  private async transition(params: {
    identifier: string;
    actor: ReturnActor;
    toStatus: ReturnStatus;
    action: ReturnHistoryAction;
    comment?: string;
    customerVisible: boolean;
    patch: (entity: ReturnRequestEntity) => Partial<ReturnRequestEntity>;
  }): Promise<IReturnRequestDetail> {
    const request = await this.requireReturn(params.identifier);
    return this.transitionEntity(request, params.toStatus, {
      action: params.action,
      comment: params.comment?.trim() ?? null,
      customerVisible: params.customerVisible,
      actor: params.actor,
      patch: params.patch,
    });
  }

  private async transitionEntity(
    request: ReturnRequestEntity,
    toStatus: ReturnStatus,
    options: {
      action: ReturnHistoryAction;
      comment: string | null;
      customerVisible: boolean;
      actor: ReturnActor;
      metadata?: Record<string, unknown> | null;
      patch?: (entity: ReturnRequestEntity) => Partial<ReturnRequestEntity>;
    },
  ): Promise<IReturnRequestDetail> {
    await this.dataSource.transaction(async (manager) => {
      const locked = await this.lockAndAssert(manager, request.id, toStatus);
      await this.applyStatus(manager, locked, toStatus, {
        ...(options.patch?.(locked) ?? {}),
        updatedBy: options.actor.email ?? options.actor.id,
      });
      await this.writeHistory(manager, locked, toStatus, {
        action: options.action,
        comment: options.comment,
        customerVisible: options.customerVisible,
        actor: options.actor,
        metadata: options.metadata ?? null,
      });
    });
    await this.audit(request, options.action, options.actor, { toStatus });
    return this.getDetail(request.id);
  }

  private async lockAndAssert(
    manager: EntityManager,
    returnRequestId: string,
    toStatus: ReturnStatus,
  ): Promise<ReturnRequestEntity> {
    const locked = await this.returnRequestsRepository.lockById(returnRequestId, manager);
    if (!locked) {
      throw new NotFoundException({
        code: RETURN_REQUEST_NOT_FOUND,
        message: 'Return request not found',
      });
    }
    if (!canTransitionReturnStatus(locked.status, toStatus)) {
      throw new BadRequestException({
        code: INVALID_STATUS_TRANSITION,
        message: `Cannot move return from ${locked.status} to ${toStatus}`,
      });
    }
    return locked;
  }

  private async applyStatus(
    manager: EntityManager,
    locked: ReturnRequestEntity,
    toStatus: ReturnStatus,
    patch: Partial<ReturnRequestEntity>,
  ): Promise<void> {
    await this.returnRequestsRepository.updateById(
      locked.id,
      { ...patch, status: toStatus },
      manager,
    );
  }

  private async writeHistory(
    manager: EntityManager,
    fromEntity: ReturnRequestEntity,
    toStatus: ReturnStatus,
    options: {
      action: ReturnHistoryAction;
      comment: string | null;
      customerVisible: boolean;
      actor: ReturnActor;
      metadata: Record<string, unknown> | null;
    },
  ): Promise<void> {
    await this.returnRequestsRepository.addHistory(
      {
        returnRequestId: fromEntity.id,
        fromStatus: fromEntity.status,
        toStatus,
        action: options.action,
        comment: options.comment,
        isCustomerVisible: options.customerVisible,
        performedBy: options.actor.email ?? options.actor.id,
        performedByRole: options.actor.role ?? null,
        metadata: options.metadata,
      },
      manager,
    );
  }

  private async audit(
    request: ReturnRequestEntity,
    action: ReturnHistoryAction,
    actor: ReturnActor,
    details?: Record<string, unknown>,
  ): Promise<void> {
    await this.auditService.log({
      entityType: AuditEntityType.RETURN_REQUEST,
      entityId: request.id,
      entityRefId: request.refId,
      action,
      performedBy: actor.email ?? actor.id,
      details: { returnNumber: request.returnNumber, ...details },
    });
  }

  private async requireReturn(identifier: string): Promise<ReturnRequestEntity> {
    const request = await this.returnRequestsRepository.findByAnyIdentifier(identifier);
    if (!request) {
      throw new NotFoundException({
        code: RETURN_REQUEST_NOT_FOUND,
        message: 'Return request not found',
      });
    }
    return request;
  }
}

const PICKUP_STATUS_TO_RETURN_STATUS: Partial<Record<ReturnPickupStatus, ReturnStatus>> = {
  [ReturnPickupStatus.SCHEDULED]: ReturnStatus.PICKUP_SCHEDULED,
  [ReturnPickupStatus.ATTEMPTED]: ReturnStatus.PICKUP_ATTEMPTED,
  [ReturnPickupStatus.PICKED_UP]: ReturnStatus.PICKED_UP,
  [ReturnPickupStatus.IN_TRANSIT]: ReturnStatus.IN_TRANSIT_TO_WAREHOUSE,
  [ReturnPickupStatus.DELIVERED_TO_WAREHOUSE]: ReturnStatus.RECEIVED_AT_WAREHOUSE,
};
