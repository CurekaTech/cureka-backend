import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ShipmentUpdatedEvent } from '@packages/events';
import { generateUniqueRefId } from '@packages/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import {
  applyOrderStatusTimestamps,
  resolveOccurredAt,
} from '@modules/orders/utils/order-status-timestamps.util';
import { ShipwayStatusMapper } from '../mappers/shipway-status.mapper';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import {
  IShipwayTrackingEvent,
  IShipwayTrackingResponse,
  IShipwayWebhookEvent,
} from '../interfaces/shipway-api.interface';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentsRepository } from '../repositories/shipments.repository';
import { ShipmentEventsRepository } from '../repositories/shipment-events.repository';
import { ShipwayWebhookUnresolvedRepository } from '../repositories/shipway-webhook-unresolved.repository';
import { ShipwayService } from './shipway.service';

export type ShipwayReconcileSource =
  | 'webhook-oms'
  | 'manual-cli'
  | 'background'
  | 'recovery';

export type ShipwayReconcileResult = {
  outcome: 'created' | 'updated' | 'unchanged' | 'rejected' | 'not_found';
  reason?: string;
  shipment?: ShipmentEntity;
  order?: OrderEntity;
  proposed?: Record<string, unknown>;
};

export type ShipwayIdentifierHints = {
  payloadOrderId?: string | null;
  awbNumber?: string | null;
  omsOrderId?: string | null;
  orderUuid?: string | null;
  orderNumber?: string | null;
  refId?: string | null;
};

@Injectable()
export class ShipwayShipmentReconciliationService {
  private readonly logger = new Logger(ShipwayShipmentReconciliationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly shipmentEventsRepository: ShipmentEventsRepository,
    private readonly unresolvedRepository: ShipwayWebhookUnresolvedRepository,
    private readonly shipwayService: ShipwayService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Idempotent reconcile of an externally verified Shipway shipment into local DB.
   * Never creates customer orders. Never re-pushes to Shipway.
   * Does not set pushed_at when discovering via reconcile-only.
   */
  async reconcileVerifiedExternalShipment(params: {
    hints: ShipwayIdentifierHints;
    source: ShipwayReconcileSource;
    dryRun?: boolean;
    emitEvents?: boolean;
    trackingOverride?: IShipwayTrackingResponse | null;
  }): Promise<ShipwayReconcileResult> {
    const dryRun = params.dryRun === true;
    const emitEvents = params.emitEvents !== false && !dryRun;

    const tracking =
      params.trackingOverride ??
      (await this.fetchTrustedOmsTracking(params.hints));

    if (!tracking || !(tracking.current_status || tracking.current_status_code || tracking.awb_number)) {
      return { outcome: 'not_found', reason: 'oms_shipment_not_found' };
    }

    const resolvedIds = this.extractIdentifiers(tracking, params.hints);
    const order = await this.resolveLocalOrderExact(resolvedIds);
    if (!order) {
      return {
        outcome: 'rejected',
        reason: 'unknown_or_legacy_order',
        proposed: {
          merchantOrderId: resolvedIds.orderNumber,
          omsOrderId: resolvedIds.omsOrderId,
          awbNumber: resolvedIds.awbNumber,
          note: 'Will not create a customer order',
        },
      };
    }

    this.assertNoConflictingMapping(order, resolvedIds);

    const existing = await this.findExistingShipment(order, resolvedIds);
    const mapped = this.mapTrackingToShipmentFields(order, tracking, resolvedIds, existing);
    const previousStatus = existing?.shipmentStatus ?? null;

    if (dryRun) {
      const dispatchedOrLater = [
        ShipmentStatus.PICKUP_COMPLETE,
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.OUT_FOR_DELIVERY,
        ShipmentStatus.DELIVERED,
      ].includes(mapped.shipmentStatus);
      return {
        outcome: existing ? 'updated' : 'created',
        reason: 'dry_run',
        order,
        shipment: existing ?? undefined,
        proposed: {
          action: existing ? 'update_shipment' : 'insert_shipment',
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipwayOrderId: mapped.shipwayOrderId,
          omsOrderId: mapped.omsOrderId,
          awbNumber: mapped.awbNumber,
          shipmentStatus: mapped.shipmentStatus,
          shipwayRawStatus: mapped.shipwayRawStatus,
          groupKey: mapped.groupKey,
          pushedAt: existing?.pushedAt ?? null,
          note: 'pushed_at left null when only discovered via reconciliation',
          eventCount: (tracking.events ?? tracking.scans ?? []).length,
          previousStatus,
          verifiedOrderAwbAssociation: {
            localOrderNumber: order.orderNumber,
            omsMerchantOrderId: resolvedIds.orderNumber,
            omsOrderId: resolvedIds.omsOrderId,
            awbNumber: resolvedIds.awbNumber,
          },
          notificationWouldQueueIfNotifyEnabled:
            dispatchedOrLater && Boolean(mapped.awbNumber),
          notificationOnApplyWithoutNotify:
            'Will write bob_notify_outbox status=suppressed so later webhooks cannot send',
          notificationOnApplyWithNotify:
            'Will emit SHIPMENT_UPDATED and allow BOB outbox send if not already blocking',
        },
      };
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      let shipment = existing;
      if (!shipment) {
        const refId = await generateUniqueRefId('shipment', (candidate) =>
          this.shipmentsRepository.existsByRefId(candidate),
        );
        shipment = await this.shipmentsRepository.create(
          {
            refId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            groupKey: mapped.groupKey,
            shipwayOrderId: mapped.shipwayOrderId,
            omsOrderId: mapped.omsOrderId,
            shipmentId: mapped.shipmentId,
            awbNumber: mapped.awbNumber,
            courierName: mapped.courierName,
            courierId: mapped.courierId,
            trackingUrl: mapped.trackingUrl,
            labelUrl: mapped.labelUrl,
            invoiceUrl: mapped.invoiceUrl,
            pickupId: mapped.pickupId,
            shipmentStatus: mapped.shipmentStatus,
            shipwayRawStatus: mapped.shipwayRawStatus,
            pushedAt: null,
            lastSyncedAt: new Date(),
            createdBy: `shipway-reconcile:${params.source}`,
            updatedBy: `shipway-reconcile:${params.source}`,
          },
          manager,
        );
      } else {
        shipment.omsOrderId = mapped.omsOrderId ?? shipment.omsOrderId;
        shipment.shipmentId = mapped.shipmentId ?? shipment.shipmentId;
        shipment.awbNumber = mapped.awbNumber ?? shipment.awbNumber;
        shipment.courierName = mapped.courierName ?? shipment.courierName;
        shipment.courierId = mapped.courierId ?? shipment.courierId;
        shipment.trackingUrl = mapped.trackingUrl ?? shipment.trackingUrl;
        shipment.labelUrl = mapped.labelUrl ?? shipment.labelUrl;
        shipment.invoiceUrl = mapped.invoiceUrl ?? shipment.invoiceUrl;
        shipment.pickupId = mapped.pickupId ?? shipment.pickupId;
        shipment.shipmentStatus = mapped.shipmentStatus;
        shipment.shipwayRawStatus = mapped.shipwayRawStatus;
        shipment.lastSyncedAt = new Date();
        shipment.updatedBy = `shipway-reconcile:${params.source}`;
        shipment = await this.shipmentsRepository.save(shipment, manager);
      }

      await this.persistTrackingEvents(
        shipment.id,
        tracking.events ?? tracking.scans ?? [],
        params.source === 'webhook-oms' ? 'webhook' : 'reconcile',
        manager,
      );
      await this.syncOrderStatusFromShipments(order.id, mapped.shipmentStatus, manager, tracking);

      return shipment;
    });

    if (emitEvents) {
      await this.eventEmitter.emitAsync(
        EVENTS.SHIPMENT_UPDATED,
        new ShipmentUpdatedEvent(saved.orderId, saved.id, previousStatus),
      );
    }

    this.logger.log(
      {
        source: params.source,
        orderId: order.id,
        orderNumber: order.orderNumber,
        shipmentId: saved.id,
        omsOrderId: saved.omsOrderId,
        awbNumber: saved.awbNumber,
        shipmentStatus: saved.shipmentStatus,
        previousStatus,
        created: !existing,
      },
      '[Shipway reconcile] persisted verified OMS shipment',
    );

    return {
      outcome: existing ? 'updated' : 'created',
      shipment: saved,
      order,
    };
  }

  async resolveWebhookShipment(
    payload: IShipwayWebhookEvent,
    authMode: string,
  ): Promise<{
    shipment: ShipmentEntity | null;
    outcome: 'found' | 'reconciled' | 'unresolved' | 'duplicate';
    reason?: string;
  }> {
    const local = await this.findShipmentForWebhook(payload);
    if (local) {
      return { shipment: local, outcome: 'found' };
    }

    const fingerprint = this.buildUnresolvedFingerprint(payload);
    const existingUnresolved = await this.unresolvedRepository.findByFingerprint(fingerprint);
    if (existingUnresolved?.outcome === 'resolved' && existingUnresolved.resolvedShipmentId) {
      const shipment = await this.shipmentsRepository.findByShipwayOrderId(
        existingUnresolved.payloadOrderId ?? payload.order_id,
      );
      if (shipment) {
        return { shipment, outcome: 'duplicate', reason: 'already_resolved_fingerprint' };
      }
    }

    // Unsigned payloads must not invent mappings by themselves — verify via OMS credentials.
    const reconcile = await this.reconcileVerifiedExternalShipment({
      hints: {
        payloadOrderId: payload.order_id,
        awbNumber: payload.awb_number ?? null,
        omsOrderId: this.looksNumericId(payload.order_id) ? payload.order_id : null,
      },
      source: 'webhook-oms',
      emitEvents: false,
    });

    if (reconcile.shipment) {
      if (existingUnresolved) {
        await this.unresolvedRepository.markOutcome(existingUnresolved.id, {
          outcome: 'resolved',
          reason: 'oms_reconciled',
          resolvedShipmentId: reconcile.shipment.id,
          resolvedOrderId: reconcile.order?.id ?? null,
          attempts: (existingUnresolved.attempts ?? 0) + 1,
        });
      } else {
        await this.recordUnresolved(payload, authMode, fingerprint, {
          outcome: 'resolved',
          reason: 'oms_reconciled',
          resolvedShipmentId: reconcile.shipment.id,
          resolvedOrderId: reconcile.order?.id ?? null,
        });
      }
      return { shipment: reconcile.shipment, outcome: 'reconciled' };
    }

    await this.recordUnresolved(payload, authMode, fingerprint, {
      outcome: 'unresolved',
      reason: reconcile.reason ?? 'shipment_not_found',
      lastError: reconcile.reason ?? null,
    });

    return {
      shipment: null,
      outcome: 'unresolved',
      reason: reconcile.reason ?? 'shipment_not_found',
    };
  }

  async findShipmentForWebhook(payload: IShipwayWebhookEvent): Promise<ShipmentEntity | null> {
    const byShipwayId = await this.shipmentsRepository.findByShipwayOrderId(payload.order_id);
    if (byShipwayId) return byShipwayId;

    if (payload.awb_number?.trim()) {
      const byAwb = await this.shipmentsRepository.findByAwbNumber(payload.awb_number.trim());
      if (byAwb) return byAwb;
    }

    if (this.looksMerchantOrderNumber(payload.order_id)) {
      const byOrderNumber = await this.shipmentsRepository.findByOrderNumber(payload.order_id);
      if (byOrderNumber) return byOrderNumber;
    }

    if (this.looksNumericId(payload.order_id)) {
      const byOms = await this.shipmentsRepository.findByOmsOrderId(payload.order_id);
      if (byOms) return byOms;
    }

    return null;
  }

  /**
   * Unsigned webhooks must verify status, AWB and order association via OMS
   * even when a local shipment already exists.
   */
  async verifyUnsignedWebhookAgainstOms(
    payload: IShipwayWebhookEvent,
    shipment: ShipmentEntity,
  ): Promise<{ ok: boolean; reason?: string; payload?: IShipwayWebhookEvent }> {
    const tracking = await this.fetchTrustedOmsTracking({
      payloadOrderId: payload.order_id,
      awbNumber: payload.awb_number ?? shipment.awbNumber,
      omsOrderId: shipment.omsOrderId,
      orderNumber: shipment.orderNumber,
      orderUuid: shipment.orderId,
    });

    if (!tracking) {
      return { ok: false, reason: 'oms_verification_unavailable' };
    }

    const ids = this.extractIdentifiers(tracking, {
      payloadOrderId: payload.order_id,
      awbNumber: payload.awb_number,
      orderNumber: shipment.orderNumber,
      omsOrderId: shipment.omsOrderId,
    });

    if (ids.awbNumber && shipment.awbNumber && ids.awbNumber !== shipment.awbNumber) {
      return { ok: false, reason: 'oms_awb_mismatch' };
    }

    if (
      ids.orderNumber &&
      this.looksMerchantOrderNumber(ids.orderNumber) &&
      ids.orderNumber !== shipment.orderNumber
    ) {
      return { ok: false, reason: 'oms_order_association_mismatch' };
    }

    const omsStatus =
      tracking.current_status_code ||
      tracking.current_status ||
      tracking.shipway_status ||
      payload.status;

    if (!omsStatus?.trim()) {
      return { ok: false, reason: 'oms_status_missing' };
    }

    // Prefer OMS-authoritative status/AWB while keeping webhook event metadata.
    const verifiedPayload: IShipwayWebhookEvent = {
      ...payload,
      status: omsStatus,
      current_status_code: tracking.current_status_code ?? payload.current_status_code,
      awb_number: ids.awbNumber ?? payload.awb_number ?? shipment.awbNumber ?? undefined,
      courier_name: tracking.courier_name ?? payload.courier_name,
      courier_id: tracking.courier_id ?? payload.courier_id,
      tracking_url: tracking.tracking_url ?? payload.tracking_url,
      status_date: tracking.current_status_date ?? payload.status_date,
      scans: tracking.events ?? tracking.scans ?? payload.scans,
    };

    return { ok: true, payload: verifiedPayload };
  }

  private async fetchTrustedOmsTracking(
    hints: ShipwayIdentifierHints,
  ): Promise<IShipwayTrackingResponse | null> {
    const candidates = [
      hints.orderNumber,
      hints.payloadOrderId,
      hints.refId,
      hints.awbNumber ? undefined : undefined,
    ].filter((value): value is string => Boolean(value?.trim()));

    for (const candidate of candidates) {
      try {
        const tracking = await this.shipwayService.getShipmentDetails(candidate, {
          awbNumber: hints.awbNumber ?? null,
        });
        if (tracking.current_status || tracking.current_status_code || tracking.awb_number) {
          return tracking;
        }
      } catch (error) {
        this.logger.warn(
          {
            candidate,
            error: error instanceof Error ? error.message : String(error),
          },
          '[Shipway reconcile] OMS lookup candidate failed',
        );
      }
    }

    if (hints.awbNumber?.trim()) {
      try {
        return await this.shipwayService.getShipmentDetails(hints.awbNumber.trim(), {
          awbNumber: hints.awbNumber.trim(),
        });
      } catch (error) {
        this.logger.warn(
          {
            awbNumber: hints.awbNumber,
            error: error instanceof Error ? error.message : String(error),
          },
          '[Shipway reconcile] OMS AWB lookup failed',
        );
      }
    }

    if (hints.orderUuid) {
      const order = await this.ordersRepository.findByIdOrRefId(hints.orderUuid);
      if (order) {
        try {
          return await this.shipwayService.getShipmentDetails(order.orderNumber, {
            awbNumber: hints.awbNumber ?? null,
          });
        } catch {
          return null;
        }
      }
    }

    return null;
  }

  private extractIdentifiers(
    tracking: IShipwayTrackingResponse,
    hints: ShipwayIdentifierHints,
  ): Required<Pick<ShipwayIdentifierHints, 'orderNumber' | 'omsOrderId' | 'awbNumber'>> & {
    shipmentId: string | null;
  } {
    const merchantFromTracking = this.pickMerchantOrderId(tracking.order_id, hints.orderNumber, hints.payloadOrderId);
    const oms =
      this.firstString(
        tracking.oms_order_id,
        tracking.ezyslip_order_id,
        hints.omsOrderId,
        this.looksNumericId(hints.payloadOrderId) ? hints.payloadOrderId : null,
      ) ?? null;
    const awb = this.firstString(tracking.awb_number, hints.awbNumber) ?? null;

    return {
      orderNumber: merchantFromTracking,
      omsOrderId: oms,
      awbNumber: awb,
      shipmentId: tracking.shipment_id != null ? String(tracking.shipment_id) : null,
    };
  }

  private pickMerchantOrderId(
    ...candidates: Array<string | null | undefined>
  ): string | null {
    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (!value) continue;
      if (this.looksMerchantOrderNumber(value) || this.looksUuid(value)) {
        return value;
      }
    }
    // Keep non-numeric legacy ids as possible merchant ids; numeric-only stays OMS-side.
    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value && !this.looksNumericId(value)) {
        return value;
      }
    }
    return null;
  }

  private async resolveLocalOrderExact(ids: {
    orderNumber: string | null;
    omsOrderId: string | null;
    awbNumber: string | null;
  }): Promise<OrderEntity | null> {
    if (ids.orderNumber) {
      if (this.looksUuid(ids.orderNumber)) {
        const byId = await this.ordersRepository.findByIdOrRefId(ids.orderNumber);
        if (byId) return byId;
      }
      const byNumber = await this.ordersRepository.findByOrderNumber(ids.orderNumber);
      if (byNumber) return byNumber;
      const byRef = await this.ordersRepository.findByIdOrRefId(ids.orderNumber);
      if (byRef) return byRef;
    }
    return null;
  }

  private assertNoConflictingMapping(
    order: OrderEntity,
    ids: { orderNumber: string | null; omsOrderId: string | null; awbNumber: string | null },
  ): void {
    if (ids.orderNumber && this.looksMerchantOrderNumber(ids.orderNumber)) {
      if (ids.orderNumber !== order.orderNumber && ids.orderNumber !== order.refId) {
        throw new BadRequestException(
          `OMS merchant order id ${ids.orderNumber} does not match local order ${order.orderNumber}`,
        );
      }
    }
  }

  private async findExistingShipment(
    order: OrderEntity,
    ids: { orderNumber: string | null; omsOrderId: string | null; awbNumber: string | null },
  ): Promise<ShipmentEntity | null> {
    if (ids.awbNumber) {
      const byAwb = await this.shipmentsRepository.findByAwbNumber(ids.awbNumber);
      if (byAwb) {
        if (byAwb.orderId !== order.id) {
          throw new BadRequestException(
            `AWB ${ids.awbNumber} already linked to a different order`,
          );
        }
        return byAwb;
      }
    }
    if (ids.omsOrderId) {
      const byOms = await this.shipmentsRepository.findByOmsOrderId(ids.omsOrderId);
      if (byOms) {
        if (byOms.orderId !== order.id) {
          throw new BadRequestException(
            `OMS id ${ids.omsOrderId} already linked to a different order`,
          );
        }
        return byOms;
      }
    }
    return this.shipmentsRepository.findByOrderId(order.id);
  }

  private mapTrackingToShipmentFields(
    order: OrderEntity,
    tracking: IShipwayTrackingResponse,
    ids: {
      orderNumber: string | null;
      omsOrderId: string | null;
      awbNumber: string | null;
      shipmentId: string | null;
    },
    existing: ShipmentEntity | null,
  ) {
    const resolved = ShipwayStatusMapper.resolveFromTracking(tracking);
    const rawStatus = resolved.rawStatus || tracking.current_status || tracking.current_status_code || 'Unknown';
    const shipmentStatus =
      resolved.shipmentStatus !== ShipmentStatus.UNKNOWN
        ? resolved.shipmentStatus
        : ShipwayStatusMapper.toShipmentStatus(rawStatus);

    const groupKey = existing?.groupKey ?? 'default';

    // Prefer existing merchant shipway_order_id; else order number. Never store bare OMS numeric as shipway_order_id when ORD… is known.
    const shipwayOrderId =
      existing?.shipwayOrderId ??
      (ids.orderNumber && this.looksMerchantOrderNumber(ids.orderNumber)
        ? ids.orderNumber
        : order.orderNumber);

    return {
      groupKey,
      shipwayOrderId,
      omsOrderId: ids.omsOrderId ?? existing?.omsOrderId ?? null,
      shipmentId: ids.shipmentId ?? existing?.shipmentId ?? null,
      awbNumber: ids.awbNumber ?? existing?.awbNumber ?? null,
      courierName: tracking.courier_name ?? existing?.courierName ?? null,
      courierId:
        tracking.courier_id != null ? String(tracking.courier_id) : existing?.courierId ?? null,
      trackingUrl: tracking.tracking_url ?? existing?.trackingUrl ?? null,
      labelUrl: tracking.label_url ?? existing?.labelUrl ?? null,
      invoiceUrl: tracking.invoice_url ?? existing?.invoiceUrl ?? null,
      pickupId:
        tracking.pickup_id != null ? String(tracking.pickup_id) : existing?.pickupId ?? null,
      shipmentStatus,
      shipwayRawStatus: rawStatus,
    };
  }

  private async persistTrackingEvents(
    shipmentId: string,
    events: IShipwayTrackingEvent[],
    source: string,
    manager: EntityManager,
  ): Promise<void> {
    for (const event of events) {
      const status = event.status?.trim();
      if (!status) continue;
      const happenedAt = event.status_date ? new Date(event.status_date) : null;
      const validHappenedAt =
        happenedAt && !Number.isNaN(happenedAt.getTime()) ? happenedAt : null;
      const description = event.message ?? event.activity ?? null;
      const duplicate = await this.shipmentEventsRepository.existsDuplicateEvent(
        shipmentId,
        status,
        validHappenedAt,
        description,
      );
      if (duplicate) continue;

      const refId = await generateUniqueRefId('shevt', (candidate) =>
        this.shipmentEventsRepository.existsByRefId(candidate),
      );
      await this.shipmentEventsRepository.create(
        {
          refId,
          shipmentId,
          status,
          description,
          location: event.location ?? null,
          happenedAt: validHappenedAt,
          source,
          createdBy: 'shipway-reconcile',
          updatedBy: 'shipway-reconcile',
        },
        manager,
      );
    }
  }

  private async syncOrderStatusFromShipments(
    orderId: string,
    shipmentStatus: ShipmentStatus,
    manager: EntityManager,
    tracking: IShipwayTrackingResponse,
  ): Promise<void> {
    const orderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus);
    if (!orderStatus) return;

    const order = await this.ordersRepository.findById(orderId, manager);
    if (!order) return;

    // Multi-shipment: do not regress a more advanced local order status.
    const rank = this.orderStatusRank(orderStatus);
    const currentRank = this.orderStatusRank(order.orderStatus);
    if (rank < currentRank) {
      return;
    }

    const shouldMarkCodPaid =
      order.paymentMethod === OrderPaymentMethod.COD &&
      shipmentStatus === ShipmentStatus.DELIVERED &&
      order.paymentStatus !== OrderPaymentStatus.PAID;

    const statusAt = resolveOccurredAt(tracking.current_status_date);

    await this.ordersRepository.updateById(
      orderId,
      {
        orderStatus,
        ...applyOrderStatusTimestamps(order, orderStatus, statusAt),
        ...(shouldMarkCodPaid ? { paymentStatus: OrderPaymentStatus.PAID } : {}),
        updatedBy: 'shipway-reconcile',
      },
      manager,
    );
  }

  private orderStatusRank(status: OrderStatus): number {
    const order: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.OUT_FOR_DELIVERY,
      OrderStatus.DELIVERED,
    ];
    const idx = order.indexOf(status);
    return idx >= 0 ? idx : 0;
  }

  private async recordUnresolved(
    payload: IShipwayWebhookEvent,
    authMode: string,
    fingerprint: string,
    data: {
      outcome: 'unresolved' | 'resolved' | 'failed' | 'duplicate' | 'ignored';
      reason?: string;
      lastError?: string | null;
      resolvedShipmentId?: string | null;
      resolvedOrderId?: string | null;
    },
  ): Promise<void> {
    const existing = await this.unresolvedRepository.findByFingerprint(fingerprint);
    if (existing) {
      await this.unresolvedRepository.markOutcome(existing.id, {
        outcome: data.outcome,
        reason: data.reason ?? null,
        lastError: data.lastError ?? null,
        resolvedShipmentId: data.resolvedShipmentId ?? null,
        resolvedOrderId: data.resolvedOrderId ?? null,
        attempts: (existing.attempts ?? 0) + 1,
      });
      return;
    }

    const refId = await generateUniqueRefId('swu', (candidate) =>
      this.unresolvedRepository.existsByRefId(candidate),
    );

    try {
      await this.unresolvedRepository.create({
        refId,
        payloadOrderId: payload.order_id ?? null,
        awbNumber: payload.awb_number ?? null,
        status: payload.status ?? null,
        payloadFingerprint: fingerprint,
        authMode,
        outcome: data.outcome,
        reason: data.reason ?? null,
        attempts: 1,
        lastError: data.lastError ?? null,
        sanitizedPayload: {
          order_id: payload.order_id ?? null,
          awb_number: payload.awb_number ?? null,
          status: payload.status ?? null,
          status_code: payload.current_status_code ?? payload.status_code ?? null,
          courier_name: payload.courier_name ?? null,
          status_date: payload.status_date ?? null,
        },
        resolvedShipmentId: data.resolvedShipmentId ?? null,
        resolvedOrderId: data.resolvedOrderId ?? null,
        createdBy: 'shipway-webhook',
        updatedBy: 'shipway-webhook',
      });
    } catch (error) {
      this.logger.warn(
        {
          fingerprint,
          error: error instanceof Error ? error.message : String(error),
        },
        '[Shipway reconcile] failed to persist unresolved webhook row',
      );
    }
  }

  buildUnresolvedFingerprint(payload: IShipwayWebhookEvent): string {
    const raw = [
      payload.order_id ?? '',
      payload.awb_number ?? '',
      payload.status ?? '',
      payload.status_date ?? '',
      payload.event_id ?? '',
      payload.message ?? '',
    ].join('|');
    return createHash('sha256').update(raw).digest('hex');
  }

  looksMerchantOrderNumber(value?: string | null): boolean {
    return Boolean(value && /^ORD/i.test(value.trim()));
  }

  looksNumericId(value?: string | null): boolean {
    return Boolean(value && /^\d{5,}$/.test(value.trim()));
  }

  looksUuid(value?: string | null): boolean {
    return Boolean(
      value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value.trim(),
        ),
    );
  }

  private firstString(...candidates: Array<string | null | undefined>): string | undefined {
    return candidates.map((value) => value?.trim()).find((value) => Boolean(value));
  }

  /** Public entry used by recovery CLI — rejects missing orders loudly. */
  async reconcileOrderByUuid(params: {
    orderUuid: string;
    awbNumber?: string | null;
    dryRun?: boolean;
    notify?: boolean;
  }): Promise<ShipwayReconcileResult> {
    const order = await this.ordersRepository.findByIdOrRefId(params.orderUuid);
    if (!order) {
      throw new NotFoundException(`Order ${params.orderUuid} not found`);
    }

    return this.reconcileVerifiedExternalShipment({
      hints: {
        orderUuid: order.id,
        orderNumber: order.orderNumber,
        refId: order.refId,
        awbNumber: params.awbNumber ?? null,
      },
      source: 'recovery',
      dryRun: params.dryRun !== false,
      emitEvents: params.notify === true && params.dryRun === false,
    });
  }
}
