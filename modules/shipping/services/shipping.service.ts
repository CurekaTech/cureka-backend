import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, ShipmentUpdatedEvent } from '@packages/events';
import { generateUniqueRefId } from '@packages/common';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { ShipwayStatusMapper } from '../mappers/shipway-status.mapper';
import { HIDDEN_SHIPWAY_SCAN_STATUSES } from '../constants/shipway-status.constants';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import {
  IShipwayPushOrderPayload,
  IShipwayPushOrderResponse,
  IShipwayTrackingEvent,
  IShipwayTrackingResponse,
  IShipwayWebhookEvent,
} from '../interfaces/shipway-api.interface';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentEventEntity } from '../entities/shipment-event.entity';
import { ShipmentsRepository } from '../repositories/shipments.repository';
import { ShipmentEventsRepository } from '../repositories/shipment-events.repository';
import { ShipwayService } from './shipway.service';

export type ShipwayWebhookBatchResult = {
  processed: number;
  skipped: number;
  notFound: number;
  results: Array<{
    orderId: string;
    outcome: 'processed' | 'skipped' | 'not_found';
    reason?: string;
  }>;
};

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly ordersRepository: OrdersRepository,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly shipmentEventsRepository: ShipmentEventsRepository,
    private readonly shipwayService: ShipwayService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async pushOrderToShipway(orderId: string): Promise<ShipmentEntity | null> {
    this.logger.log({ orderId }, 'Shipway push started');
    const order = await this.ordersRepository.findByIdWithItems(orderId);
    if (!order) {
      this.logger.warn({ orderId }, 'Shipway push order lookup failed');
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        itemCount: order.items?.length ?? 0,
      },
      'Shipway push order loaded',
    );

    if (!this.isReadyForShipway(order)) {
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
        },
        'Skipping Shipway push because order is not ready',
      );
      return null;
    }

    const existing = await this.shipmentsRepository.findByOrderId(order.id);
    if (existing?.pushedAt) {
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, shipmentId: existing.id, pushedAt: existing.pushedAt },
        'Existing shipment already pushed; skipping duplicate Shipway push',
      );
      return existing;
    }

    const payload = this.buildPushOrderPayload(order);
    const payloadSummary = this.summarizeShipwayPushPayload(payload);
    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        api: 'POST /api/v2orders',
        when: 'after order confirm (kickoffFulfillment → pushOrderToShipway)',
        carrierIdPresent: payload.carrier_id != null,
        carrierId: payload.carrier_id ?? null,
        warehouseId: payload.warehouse_id ?? null,
        payload: payloadSummary,
      },
      '[Shipway] Push payload ready — calling Shipway',
    );
    this.validateShipwayPayload(payload, order);

    let response: IShipwayPushOrderResponse;
    try {
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          api: 'POST /api/v2orders',
          paymentType: payload.payment_type,
          productCount: payload.products.length,
          carrierIdPresent: payload.carrier_id != null,
          carrierId: payload.carrier_id ?? null,
          warehouseId: payload.warehouse_id ?? null,
        },
        '[Shipway] Calling push order API now',
      );
      response = await this.shipwayService.pushOrder(payload);
    } catch (error) {
      this.logger.error(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          api: 'POST /api/v2orders',
          payload: payloadSummary,
          error: this.serializeError(error),
        },
        '[Shipway] Push order API threw an exception',
      );
      throw error;
    }

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        api: 'POST /api/v2orders',
        response: this.summarizeShipwayPushResponse(response),
      },
      '[Shipway] Push order API response received',
    );

    if (!response.success) {
      this.logger.warn(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          api: 'POST /api/v2orders',
          response: this.summarizeShipwayPushResponse(response),
        },
        '[Shipway] Push rejected by Shipway',
      );
      throw new BadRequestException(response.message || 'Shipway rejected order push');
    }

    const rawStatus = response.awb_number ? 'Processing' : 'Confirmed';
    const shipmentStatus = ShipwayStatusMapper.toShipmentStatus(rawStatus);

    return this.dataSource.transaction(async (manager) => {
      const shipment =
        existing ??
        (await this.shipmentsRepository.create(
          {
            refId: await generateUniqueRefId('shipment', (candidate) =>
              this.shipmentsRepository.existsByRefId(candidate),
            ),
            orderId: order.id,
            orderNumber: order.orderNumber,
            shipwayOrderId: order.orderNumber,
            warehouseId: payload.warehouse_id ?? null,
            returnWarehouseId: payload.return_warehouse_id ?? null,
            shipmentStatus,
            shipwayRawStatus: rawStatus,
            createdBy: 'shipway-api',
            updatedBy: 'shipway-api',
          },
          manager,
        ));

      shipment.shipmentId = this.toNullableString(response.shipment_id);
      shipment.awbNumber = response.awb_number ?? null;
      shipment.courierName = response.courier_name ?? null;
      shipment.courierId = this.toNullableString(response.courier_id);
      shipment.trackingUrl = response.tracking_url ?? null;
      shipment.labelUrl = response.label_url ?? null;
      shipment.invoiceUrl = response.invoice_url ?? null;
      shipment.pickupId = this.toNullableString(response.pickup_id);
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = rawStatus;
      shipment.pushedAt = new Date();
      shipment.lastSyncedAt = new Date();
      shipment.updatedBy = 'shipway-api';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.eventEmitter.emitAsync(
        EVENTS.SHIPMENT_UPDATED,
        new ShipmentUpdatedEvent(saved.orderId, saved.id),
      );
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentId: saved.id,
          shipwayShipmentId: saved.shipmentId,
          awbNumber: saved.awbNumber,
          shipmentStatus: saved.shipmentStatus,
        },
        'Shipment saved after Shipway push',
      );

      const nextOrderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus) ?? OrderStatus.PROCESSING;
      await this.ordersRepository.updateById(order.id, { orderStatus: nextOrderStatus, updatedBy: 'shipway-api' }, manager);
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, nextOrderStatus },
        'Order updated after Shipway push',
      );
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          shipmentId: saved.id,
          shipwayShipmentId: saved.shipmentId,
          awbNumber: saved.awbNumber,
          trackingUrl: saved.trackingUrl,
          shipmentStatus: saved.shipmentStatus,
          nextOrderStatus,
          next: 'EVENTS.SHIPMENT_UPDATED → BOB /fulfillments-create (if AWB present)',
        },
        '[Shipway] Push persisted successfully — SHIPMENT_UPDATED emitted',
      );
      return saved;
    });
  }

  async syncShipmentStatus(orderId: string): Promise<ShipmentEntity> {
    const shipment = await this.shipmentsRepository.findByOrderId(orderId);
    if (!shipment) {
      throw new NotFoundException(`Shipment for order ${orderId} not found`);
    }

    const tracking = await this.shipwayService.getShipmentDetails(shipment.shipwayOrderId);
    const resolved = this.resolveLiveTracking(tracking);
    const rawStatus = resolved.rawStatus || shipment.shipwayRawStatus || 'Unknown';
    const shipmentStatus =
      resolved.shipmentStatus !== ShipmentStatus.UNKNOWN
        ? resolved.shipmentStatus
        : ShipwayStatusMapper.toShipmentStatus(rawStatus);
    this.logger.log(
      {
        orderId,
        shipwayOrderId: shipment.shipwayOrderId,
        rawStatus,
        shipmentStatus,
        matchedFrom: resolved.matchedFrom,
        previousStatus: shipment.shipmentStatus,
        awbNumber: tracking.awb_number ?? shipment.awbNumber,
      },
      '[Shipway] syncShipmentStatus mapped raw → shipmentStatus',
    );

    return this.dataSource.transaction(async (manager) => {
      shipment.awbNumber = tracking.awb_number ?? shipment.awbNumber;
      shipment.courierName = tracking.courier_name ?? shipment.courierName;
      shipment.courierId = this.toNullableString(tracking.courier_id) ?? shipment.courierId;
      shipment.trackingUrl = tracking.tracking_url ?? shipment.trackingUrl;
      shipment.labelUrl = tracking.label_url ?? shipment.labelUrl;
      shipment.invoiceUrl = tracking.invoice_url ?? shipment.invoiceUrl;
      shipment.pickupId = this.toNullableString(tracking.pickup_id) ?? shipment.pickupId;
      shipment.shipmentId = this.toNullableString(tracking.shipment_id) ?? shipment.shipmentId;
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = rawStatus;
      shipment.lastSyncedAt = new Date();
      shipment.updatedBy = 'shipway-sync';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.eventEmitter.emitAsync(
        EVENTS.SHIPMENT_UPDATED,
        new ShipmentUpdatedEvent(saved.orderId, saved.id),
      );
      await this.recordTrackingEvents(saved.id, tracking.events ?? tracking.scans ?? [], 'polling', manager);
      await this.syncOrderStatus(saved.orderId, shipmentStatus, manager);
      return saved;
    });
  }

  async handleShipwayWebhookBatch(events: IShipwayWebhookEvent[]): Promise<ShipwayWebhookBatchResult> {
    const results: ShipwayWebhookBatchResult['results'] = [];
    let processed = 0;
    let skipped = 0;
    let notFound = 0;

    for (const event of events) {
      try {
        const outcome = await this.handleShipwayWebhook(event);
        results.push({ orderId: event.order_id, outcome: outcome.outcome, reason: outcome.reason });
        if (outcome.outcome === 'processed') processed += 1;
        else skipped += 1;
      } catch (error) {
        if (error instanceof NotFoundException) {
          notFound += 1;
          results.push({ orderId: event.order_id, outcome: 'not_found', reason: error.message });
          this.logger.warn(
            { shipwayOrderId: event.order_id, status: event.status },
            '[Shipway] Webhook shipment not found — continuing batch',
          );
          continue;
        }
        throw error;
      }
    }

    return { processed, skipped, notFound, results };
  }

  /**
   * Apply one Shipway status update. Returns skipped for duplicates / out-of-order / unknown-only.
   */
  async handleShipwayWebhook(
    payload: IShipwayWebhookEvent,
  ): Promise<{ shipment: ShipmentEntity; outcome: 'processed' | 'skipped'; reason?: string }> {
    this.logger.log(
      {
        endpoint: 'POST /api/v1/shipments/webhook',
        shipwayOrderId: payload.order_id,
        status: payload.status,
        statusCode: payload.current_status_code ?? payload.status_code ?? null,
        awbNumber: payload.awb_number ?? null,
        courierName: payload.courier_name ?? null,
        statusDate: payload.status_date ?? null,
        hasMessage: Boolean(payload.message?.trim()),
      },
      '[Shipway] Webhook event received — applying status update',
    );

    const shipment = await this.shipmentsRepository.findByShipwayOrderId(payload.order_id);
    if (!shipment) {
      throw new NotFoundException(`Shipment for Shipway order ${payload.order_id} not found`);
    }

    const idempotencyKey = this.buildWebhookIdempotencyKey(payload);
    if (shipment.lastWebhookEventId === idempotencyKey) {
      this.logger.log(
        { orderId: shipment.orderId, eventKey: idempotencyKey, shipwayOrderId: payload.order_id },
        '[Shipway] Webhook duplicate idempotency key — skipped',
      );
      return { shipment, outcome: 'skipped', reason: 'duplicate_event' };
    }

    const happenedAt = payload.status_date ? new Date(payload.status_date) : null;
    const validHappenedAt =
      happenedAt && !Number.isNaN(happenedAt.getTime()) ? happenedAt : null;

    if (validHappenedAt) {
      const latestEventAt =
        (await this.shipmentEventsRepository.findLatestHappenedAt(shipment.id)) ??
        this.latestEventHappenedAt(shipment);
      if (latestEventAt && validHappenedAt.getTime() < latestEventAt.getTime()) {
        this.logger.log(
          {
            orderId: shipment.orderId,
            shipwayOrderId: payload.order_id,
            statusDate: payload.status_date,
            latestEventAt: latestEventAt.toISOString(),
          },
          '[Shipway] Webhook out-of-order status_date — skipped',
        );
        return { shipment, outcome: 'skipped', reason: 'out_of_order' };
      }
    }

    const description = payload.message ?? null;
    if (
      await this.shipmentEventsRepository.existsDuplicateEvent(
        shipment.id,
        payload.status,
        validHappenedAt,
        description,
      )
    ) {
      this.logger.log(
        { orderId: shipment.orderId, status: payload.status, statusDate: payload.status_date },
        '[Shipway] Webhook duplicate event fingerprint — skipped',
      );
      shipment.lastWebhookEventId = idempotencyKey;
      await this.shipmentsRepository.save(shipment);
      return { shipment, outcome: 'skipped', reason: 'duplicate_event' };
    }

    const resolved = ShipwayStatusMapper.resolveFromTracking({
      current_status: payload.status,
      status: payload.status,
      current_status_code:
        payload.status_code ??
        payload.current_status_code ??
        (typeof payload['status_code'] === 'string' ? payload['status_code'] : null),
    });
    const mappedStatus =
      resolved.shipmentStatus !== ShipmentStatus.UNKNOWN
        ? resolved.shipmentStatus
        : ShipwayStatusMapper.toShipmentStatus(payload.status);
    const rawStatus = resolved.rawStatus || payload.status;

    if (mappedStatus === ShipmentStatus.UNKNOWN) {
      this.logger.warn(
        {
          orderId: shipment.orderId,
          shipwayOrderId: payload.order_id,
          rawStatus,
          previousStatus: shipment.shipmentStatus,
        },
        '[Shipway] Webhook unknown status — recording event only, shipmentStatus unchanged',
      );
      return this.dataSource.transaction(async (manager) => {
        shipment.lastWebhookEventId = idempotencyKey;
        shipment.updatedBy = 'shipway-webhook';
        const saved = await this.shipmentsRepository.save(shipment, manager);
        await this.recordShipmentEvent(
          saved.id,
          {
            status: payload.status,
            status_date: payload.status_date ?? new Date().toISOString(),
            location: payload.location,
            message: payload.message,
          },
          'webhook',
          manager,
        );
        return { shipment: saved, outcome: 'skipped', reason: 'unknown_status' };
      });
    }

    this.logger.log(
      {
        orderId: shipment.orderId,
        orderNumber: shipment.orderNumber,
        shipwayOrderId: payload.order_id,
        eventKey: idempotencyKey,
        rawStatus,
        shipmentStatus: mappedStatus,
        matchedFrom: resolved.matchedFrom,
        previousStatus: shipment.shipmentStatus,
        awbNumber: payload.awb_number ?? shipment.awbNumber,
      },
      '[Shipway] Webhook status mapped raw → shipmentStatus',
    );

    const previousStatus = shipment.shipmentStatus;

    return this.dataSource.transaction(async (manager) => {
      shipment.awbNumber = payload.awb_number ?? shipment.awbNumber;
      shipment.courierName = payload.courier_name ?? shipment.courierName;
      shipment.courierId = this.toNullableString(payload.courier_id) ?? shipment.courierId;
      shipment.trackingUrl = payload.tracking_url ?? shipment.trackingUrl;
      shipment.labelUrl = payload.label_url ?? shipment.labelUrl;
      shipment.invoiceUrl = payload.invoice_url ?? shipment.invoiceUrl;
      shipment.pickupId = this.toNullableString(payload.pickup_id) ?? shipment.pickupId;
      shipment.shipmentId = this.toNullableString(payload.shipment_id) ?? shipment.shipmentId;
      shipment.shipmentStatus = mappedStatus;
      shipment.shipwayRawStatus = rawStatus;
      shipment.lastSyncedAt = new Date();
      shipment.lastWebhookEventId = idempotencyKey;
      shipment.updatedBy = 'shipway-webhook';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.eventEmitter.emitAsync(
        EVENTS.SHIPMENT_UPDATED,
        new ShipmentUpdatedEvent(saved.orderId, saved.id),
      );
      await this.recordShipmentEvent(
        saved.id,
        {
          status: payload.status,
          status_date: payload.status_date ?? new Date().toISOString(),
          location: payload.location,
          message: payload.message,
        },
        'webhook',
        manager,
      );
      if (Array.isArray(payload.scans) && payload.scans.length > 0) {
        await this.recordTrackingEvents(saved.id, payload.scans, 'webhook', manager);
      }
      await this.syncOrderStatus(saved.orderId, mappedStatus, manager);
      this.logger.log(
        {
          endpoint: 'POST /api/v1/shipments/webhook',
          orderId: saved.orderId,
          orderNumber: saved.orderNumber,
          shipwayOrderId: payload.order_id,
          previousStatus,
          shipmentStatus: saved.shipmentStatus,
          shipwayRawStatus: saved.shipwayRawStatus,
          awbNumber: saved.awbNumber,
          orderStatusSynced: true,
          next: 'EVENTS.SHIPMENT_UPDATED → BOB /fulfillments-create + /fulfillments-events-create (if AWB)',
        },
        '[Shipway] Webhook applied — DB updated and SHIPMENT_UPDATED emitted',
      );
      return { shipment: saved, outcome: 'processed' as const };
    });
  }

  getShipmentByOrderId(orderId: string): Promise<ShipmentEntity | null> {
    return this.shipmentsRepository.findByOrderId(orderId);
  }

  /**
   * Live Shipway lookup for the customer shipment API.
   * Prefers local DB when a recent webhook/sync is fresh; otherwise live-polls Shipway.
   * Returns shipwayStatus=true only when a usable status is available.
   */
  async resolveShipmentForOrder(
    orderId: string,
    orderNumber: string,
  ): Promise<{ shipment: ShipmentEntity | null; shipwayStatus: boolean }> {
    const local = await this.shipmentsRepository.findByOrderId(orderId);
    const shipwayOrderId = local?.shipwayOrderId ?? orderNumber;

    if (local && this.isLocalShipmentFresh(local)) {
      const usable = Boolean(local.shipwayRawStatus?.trim() || local.shipmentStatus);
      this.logger.log(
        {
          orderId,
          orderNumber,
          shipwayOrderId,
          shipwayStatus: usable,
          reason: 'webhook_fresh_local',
          lastSyncedAt: local.lastSyncedAt,
          shipmentStatus: local.shipmentStatus,
          shipwayRawStatus: local.shipwayRawStatus,
        },
        '[Shipway] Using fresh local shipment — skipping live GET',
      );
      return { shipment: local, shipwayStatus: usable };
    }

    this.logger.log(
      {
        orderId,
        orderNumber,
        shipwayOrderId,
        hasLocalShipment: Boolean(local),
        localShipment: local
          ? {
              id: local.id,
              refId: local.refId,
              shipwayOrderId: local.shipwayOrderId,
              shipmentId: local.shipmentId,
              shipmentStatus: local.shipmentStatus,
              shipwayRawStatus: local.shipwayRawStatus,
              awbNumber: local.awbNumber,
              courierName: local.courierName,
              trackingUrl: local.trackingUrl,
              pushedAt: local.pushedAt,
              lastSyncedAt: local.lastSyncedAt,
              eventCount: local.events?.length ?? 0,
            }
          : null,
      },
      '[Shipway] Connecting to Shipway for order shipment details',
    );

    try {
      this.logger.log(
        {
          orderId,
          orderNumber,
          shipwayOrderId,
          awbNumber: local?.awbNumber ?? null,
          lookupPlan: [
            'POST {SHIPWAY_TRACKING_BASE_URL}/api/getOrderShipmentDetails',
            'GET {SHIPWAY_BASE_URL}/api/getorders?orderid=',
            'GET {SHIPWAY_BASE_URL}/api/tracking?awb_numbers=',
          ],
        },
        '[Shipway] Calling multi-host shipment lookup',
      );

      const trackingStartedAt = Date.now();
      const tracking = await this.shipwayService.getShipmentDetails(shipwayOrderId, {
        awbNumber: local?.awbNumber ?? null,
      });
      const resolved = this.resolveLiveTracking(tracking);
      const rawStatus = resolved.rawStatus || undefined;
      const events = tracking.events ?? tracking.scans ?? [];

      this.logger.log(
        {
          orderId,
          orderNumber,
          shipwayOrderId,
          elapsedMs: Date.now() - trackingStartedAt,
          success: tracking.success,
          message: tracking.message ?? null,
          usableStatus: Boolean(rawStatus),
          rawStatus: rawStatus || null,
          mappedStatus: resolved.shipmentStatus,
          matchedFrom: resolved.matchedFrom,
          current_status: tracking.current_status ?? null,
          current_status_code: tracking.current_status_code ?? null,
          status: tracking.status ?? null,
          current_status_date: tracking.current_status_date ?? null,
          awb_number: tracking.awb_number ?? null,
          courier_name: tracking.courier_name ?? null,
          courier_id: tracking.courier_id ?? null,
          shipment_id: tracking.shipment_id ?? null,
          pickup_id: tracking.pickup_id ?? null,
          tracking_url: tracking.tracking_url ?? null,
          label_url: tracking.label_url ?? null,
          invoice_url: tracking.invoice_url ?? null,
          eventCount: events.length,
          events: events.map((event) => ({
            status: event.status,
            status_date: event.status_date,
            location: event.location,
            message: event.message,
            activity: event.activity,
          })),
          fullTrackingResponse: tracking,
        },
        events.length === 0
          ? '[Shipway] Tracking status received but scan history is empty'
          : '[Shipway] Received normalized tracking from getOrderShipmentDetails',
      );

      if (resolved.shipmentStatus === ShipmentStatus.UNKNOWN && rawStatus) {
        this.logger.warn(
          {
            orderId,
            orderNumber,
            rawStatus,
            current_status: tracking.current_status ?? null,
            current_status_code: tracking.current_status_code ?? null,
            shipway_status: tracking.shipway_status ?? null,
          },
          '[Shipway] Unmapped status code — add it to SHIPWAY_TO_SHIPMENT_STATUS_MAP',
        );
      }

      if (!rawStatus) {
        this.logger.warn(
          {
            orderId,
            orderNumber,
            shipwayOrderId,
            shipwayStatus: false,
            reason: 'empty_status',
            trackingSuccess: tracking.success,
            trackingMessage: tracking.message,
          },
          '[Shipway] No usable status in response — shipwayStatus=false, default 4-step flow',
        );
        return { shipment: local, shipwayStatus: false };
      }

      if (local) {
        this.logger.log(
          {
            orderId,
            orderNumber,
            shipwayOrderId,
            rawStatus,
            mappedStatus: resolved.shipmentStatus,
            matchedFrom: resolved.matchedFrom,
          },
          '[Shipway] Status found — persisting sync onto local shipment',
        );
        const synced = this.overlayLiveTrackingEvents(
          await this.persistTrackingUpdate(local, tracking, rawStatus),
          tracking,
        );
        this.logger.log(
          {
            orderId,
            orderNumber,
            shipwayStatus: true,
            shipmentId: synced.id,
            shipmentStatus: synced.shipmentStatus,
            shipwayRawStatus: synced.shipwayRawStatus,
            awbNumber: synced.awbNumber,
            courierName: synced.courierName,
            lastSyncedAt: synced.lastSyncedAt,
          },
          '[Shipway] Local shipment synced from Shipway — shipwayStatus=true',
        );
        return { shipment: synced, shipwayStatus: true };
      }

      this.logger.log(
        {
          orderId,
          orderNumber,
          shipwayOrderId,
          rawStatus,
          mappedStatus: resolved.shipmentStatus,
          matchedFrom: resolved.matchedFrom,
          shipwayStatus: true,
        },
        '[Shipway] Status found without local shipment row — building ephemeral response, shipwayStatus=true',
      );
      return {
        shipment: this.overlayLiveTrackingEvents(
          this.buildEphemeralShipmentFromTracking(orderId, orderNumber, tracking, rawStatus),
          tracking,
        ),
        shipwayStatus: true,
      };
    } catch (error) {
      this.logger.warn(
        {
          orderId,
          orderNumber,
          shipwayOrderId,
          shipwayStatus: false,
          reason: 'api_error',
          error: this.serializeError(error),
          hasLocalShipment: Boolean(local),
        },
        '[Shipway] Connection/lookup failed — shipwayStatus=false, default 4-step flow',
      );
      return { shipment: local, shipwayStatus: false };
    }
  }

  private async persistTrackingUpdate(
    shipment: ShipmentEntity,
    tracking: IShipwayTrackingResponse,
    rawStatus: string,
  ): Promise<ShipmentEntity> {
    const resolved = this.resolveLiveTracking(tracking);
    const shipmentStatus =
      resolved.shipmentStatus !== ShipmentStatus.UNKNOWN
        ? resolved.shipmentStatus
        : ShipwayStatusMapper.toShipmentStatus(rawStatus);
    const persistedRaw = resolved.rawStatus || rawStatus;
    this.logger.log(
      {
        orderId: shipment.orderId,
        orderNumber: shipment.orderNumber,
        rawStatus: persistedRaw,
        shipmentStatus,
        matchedFrom: resolved.matchedFrom,
        previousStatus: shipment.shipmentStatus,
        awbNumber: tracking.awb_number ?? shipment.awbNumber,
      },
      '[Shipway] persistTrackingUpdate mapped raw → shipmentStatus',
    );

    return this.dataSource.transaction(async (manager) => {
      shipment.awbNumber = tracking.awb_number ?? shipment.awbNumber;
      shipment.courierName = tracking.courier_name ?? shipment.courierName;
      shipment.courierId = this.toNullableString(tracking.courier_id) ?? shipment.courierId;
      shipment.trackingUrl = tracking.tracking_url ?? shipment.trackingUrl;
      shipment.labelUrl = tracking.label_url ?? shipment.labelUrl;
      shipment.invoiceUrl = tracking.invoice_url ?? shipment.invoiceUrl;
      shipment.pickupId = this.toNullableString(tracking.pickup_id) ?? shipment.pickupId;
      shipment.shipmentId = this.toNullableString(tracking.shipment_id) ?? shipment.shipmentId;
      shipment.shipmentStatus = shipmentStatus;
      shipment.shipwayRawStatus = persistedRaw;
      shipment.lastSyncedAt = new Date();
      shipment.updatedBy = 'shipway-sync';

      const saved = await this.shipmentsRepository.save(shipment, manager);
      await this.eventEmitter.emitAsync(
        EVENTS.SHIPMENT_UPDATED,
        new ShipmentUpdatedEvent(saved.orderId, saved.id),
      );
      await this.recordTrackingEvents(saved.id, tracking.events ?? tracking.scans ?? [], 'polling', manager);
      await this.syncOrderStatus(saved.orderId, shipmentStatus, manager);
      return (await this.shipmentsRepository.findByOrderId(saved.orderId, manager)) ?? saved;
    });
  }

  private buildEphemeralShipmentFromTracking(
    orderId: string,
    orderNumber: string,
    tracking: IShipwayTrackingResponse,
    rawStatus: string,
  ): ShipmentEntity {
    const now = new Date();
    const resolved = this.resolveLiveTracking(tracking);
    const shipmentStatus =
      resolved.shipmentStatus !== ShipmentStatus.UNKNOWN
        ? resolved.shipmentStatus
        : ShipwayStatusMapper.toShipmentStatus(rawStatus);
    return {
      id: orderId,
      refId: orderNumber,
      orderId,
      orderNumber,
      groupKey: 'default',
      shipwayOrderId: orderNumber,
      shipmentId: this.toNullableString(tracking.shipment_id),
      awbNumber: tracking.awb_number ?? null,
      courierName: tracking.courier_name ?? null,
      courierId: this.toNullableString(tracking.courier_id),
      trackingUrl: tracking.tracking_url ?? null,
      labelUrl: tracking.label_url ?? null,
      invoiceUrl: tracking.invoice_url ?? null,
      pickupId: this.toNullableString(tracking.pickup_id),
      warehouseId: null,
      returnWarehouseId: null,
      shipmentStatus,
      shipwayRawStatus: resolved.rawStatus || rawStatus,
      pushedAt: null,
      lastSyncedAt: now,
      lastWebhookEventId: null,
      events: [],
      items: [],
      createdAt: now,
      updatedAt: now,
      createdBy: 'shipway-live',
      updatedBy: 'shipway-live',
    } as ShipmentEntity;
  }

  private isReadyForShipway(order: OrderEntity): boolean {
    if ([OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.RTO, OrderStatus.FAILED_DELIVERY].includes(order.orderStatus)) {
      return false;
    }

    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return true;
    }

    return order.paymentStatus === OrderPaymentStatus.PAID && order.orderStatus !== OrderStatus.PENDING;
  }

  private buildPushOrderPayload(order: OrderEntity): IShipwayPushOrderPayload {
    const [firstName, ...lastNameParts] = order.recipientName.trim().split(/\s+/);
    const warehouseId = this.configService.get<string>('shipway.warehouseId') || undefined;
    const returnWarehouseId =
      this.configService.get<string>('shipway.returnWarehouseId') ||
      warehouseId ||
      undefined;
    const carrierId = this.resolveOptionalCarrierId();
    const parcel = this.buildParcelDetails(order);

    const payload: IShipwayPushOrderPayload = {
      order_id: order.orderNumber,
      payment_type: order.paymentMethod === OrderPaymentMethod.COD ? 'C' : 'P',
      products: order.items.map((item) => ({
        product: item.productName,
        price: item.unitPrice,
        product_code: item.sku,
        product_quantity: String(item.quantity),
      })),
      shipping_firstname: firstName || 'Customer',
      shipping_lastname: lastNameParts.join(' ') || undefined,
      shipping_phone: order.phoneNumber,
      shipping_address: order.addressLine1,
      shipping_address2: order.addressLine2 ?? undefined,
      shipping_city: order.city,
      shipping_state: order.state,
      shipping_zipcode: order.pincode,
      shipping_country: 'India',
      billing_firstname: firstName || 'Customer',
      billing_lastname: lastNameParts.join(' ') || undefined,
      billing_phone: order.phoneNumber,
      billing_address: order.addressLine1,
      billing_address2: order.addressLine2 ?? undefined,
      billing_city: order.city,
      billing_state: order.state,
      billing_zipcode: order.pincode,
      billing_country: 'India',
      order_total: order.grandTotal,
      discount: order.discountAmount,
      shipping: order.shippingAmount,
      order_weight: String(parcel.weightGrams),
      box_length: parcel.lengthCm,
      box_breadth: parcel.breadthCm,
      box_height: parcel.heightCm,
      warehouse_id: warehouseId,
      return_warehouse_id: returnWarehouseId,
      email: order.user?.email,
      order_date: this.formatShipwayDate(order.placedAt ?? order.createdAt),
    };

    // Omit carrier_id entirely when unset — do not send null/NaN (Shipway rejects those).
    if (carrierId !== undefined) {
      payload.carrier_id = carrierId;
    }

    return payload;
  }

  /**
   * Optional env `SHIPWAY_CARRIER_ID` → positive int, else undefined (Shipway auto-select).
   */
  private resolveOptionalCarrierId(): number | undefined {
    const raw = this.configService.get<number | string | null | undefined>('shipway.carrierId');
    if (raw === undefined || raw === null || raw === '') {
      return undefined;
    }
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw).trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      this.logger.warn(
        { rawCarrierId: raw },
        '[Shipway] Ignoring invalid SHIPWAY_CARRIER_ID — omitting carrier_id from push',
      );
      return undefined;
    }
    return Math.trunc(parsed);
  }

  private buildParcelDetails(order: OrderEntity) {
    const fallback = {
      weightGrams: this.getPositiveNumberConfig('shipway.defaultWeightGrams', 500),
      lengthCm: this.getPositiveNumberConfig('shipway.defaultLengthCm', 10),
      breadthCm: this.getPositiveNumberConfig('shipway.defaultBreadthCm', 10),
      heightCm: this.getPositiveNumberConfig('shipway.defaultHeightCm', 5),
    };

    let totalWeightGrams = 0;
    const lengths: number[] = [];
    const breadths: number[] = [];
    const heights: number[] = [];
    const fallbackSkus: string[] = [];

    for (const item of order.items ?? []) {
      const quantity = Math.max(item.quantity, 1);
      const variant = item.variant;
      const itemWeight = this.toWeightGrams(variant?.weight, variant?.weightUnit);
      const itemLength = this.toLengthCm(variant?.length, variant?.lengthUnit);
      const itemBreadth = this.toLengthCm(variant?.width, variant?.widthUnit);
      const itemHeight = this.toLengthCm(variant?.height, variant?.heightUnit);

      if (itemWeight) {
        totalWeightGrams += itemWeight * quantity;
      } else {
        totalWeightGrams += fallback.weightGrams * quantity;
        fallbackSkus.push(item.sku);
      }

      lengths.push(itemLength ?? fallback.lengthCm);
      breadths.push(itemBreadth ?? fallback.breadthCm);
      heights.push(itemHeight ?? fallback.heightCm);
    }

    const parcel = {
      weightGrams: Math.ceil(totalWeightGrams || fallback.weightGrams),
      lengthCm: Math.ceil(Math.max(...lengths, fallback.lengthCm)),
      breadthCm: Math.ceil(Math.max(...breadths, fallback.breadthCm)),
      heightCm: Math.ceil(Math.max(...heights, fallback.heightCm)),
      fallbackSkus,
    };

    this.logger.log(
      { orderId: order.id, orderNumber: order.orderNumber, parcel },
      'Resolved Shipway parcel details',
    );

    return parcel;
  }

  private validateShipwayPayload(payload: IShipwayPushOrderPayload, order: OrderEntity): void {
    const errors: string[] = [];

    this.requireString(payload.order_id, 'order_id', errors);
    if (!['P', 'C'].includes(payload.payment_type)) {
      errors.push(`payment_type must be P or C, received ${payload.payment_type}`);
    }

    if (!payload.products.length) {
      errors.push('products must contain at least one item');
    }

    payload.products.forEach((product, index) => {
      this.requireString(product.product, `products[${index}].product`, errors);
      this.requireString(product.product_code, `products[${index}].product_code`, errors);
      this.requireString(product.price, `products[${index}].price`, errors);
      this.requirePositiveNumber(product.product_quantity, `products[${index}].product_quantity`, errors);
    });

    this.requireString(payload.shipping_firstname, 'shipping_firstname', errors);
    this.requireString(payload.shipping_phone, 'shipping_phone', errors);
    this.requireString(payload.shipping_address, 'shipping_address', errors);
    this.requireString(payload.shipping_city, 'shipping_city', errors);
    this.requireString(payload.shipping_state, 'shipping_state', errors);
    this.requireString(payload.shipping_zipcode, 'shipping_zipcode', errors);
    this.requireString(payload.shipping_country, 'shipping_country', errors);
    this.requirePositiveNumber(payload.order_weight, 'order_weight', errors);
    this.requirePositiveNumber(payload.box_length, 'box_length', errors);
    this.requirePositiveNumber(payload.box_breadth, 'box_breadth', errors);
    this.requirePositiveNumber(payload.box_height, 'box_height', errors);

    if (!/^[6-9]\d{9}$/.test(payload.shipping_phone)) {
      errors.push('shipping_phone must be a valid 10 digit Indian mobile number');
    }

    if (!/^\d{6}$/.test(payload.shipping_zipcode)) {
      errors.push('shipping_zipcode must be a valid 6 digit pincode');
    }

    if (['Address not provided', 'NA'].includes(payload.shipping_address) || ['NA'].includes(payload.shipping_city) || ['NA'].includes(payload.shipping_state)) {
      errors.push('shipping address/city/state must be real customer address values');
    }

    if (!payload.warehouse_id) {
      this.logger.warn(
        { orderId: order.id, orderNumber: order.orderNumber },
        'Shipway warehouse ID is not configured; Shipway may reject label-generation requests',
      );
    }

    const validationLog = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      paymentType: payload.payment_type,
      warehouseId: payload.warehouse_id ?? null,
      returnWarehouseId: payload.return_warehouse_id ?? null,
      parcel: {
        weightGrams: payload.order_weight,
        lengthCm: payload.box_length,
        breadthCm: payload.box_breadth,
        heightCm: payload.box_height,
      },
      address: {
        phone: payload.shipping_phone,
        city: payload.shipping_city,
        state: payload.shipping_state,
        pincode: payload.shipping_zipcode,
      },
      errors,
    };

    if (errors.length) {
      this.logger.warn(validationLog, 'Shipway payload validation failed');
      throw new BadRequestException(`Shipway payload validation failed: ${errors.join('; ')}`);
    }

    this.logger.log(validationLog, 'Shipway payload validation passed');
  }

  private requireString(value: string | undefined, field: string, errors: string[]): void {
    if (!value || !value.trim()) {
      errors.push(`${field} is required`);
    }
  }

  private requirePositiveNumber(value: string | number | undefined, field: string, errors: string[]): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${field} must be a positive number`);
    }
  }

  private resolveLiveTracking(tracking: IShipwayTrackingResponse) {
    const events = tracking.events ?? tracking.scans ?? tracking.scan ?? [];
    const latest = events[0];
    return ShipwayStatusMapper.resolveFromTracking({
      current_status: tracking.current_status,
      status: tracking.status,
      current_status_code: tracking.current_status_code,
      shipway_status: tracking.shipway_status,
      latest_scan_status:
        latest?.status_detail ?? latest?.status ?? latest?.message ?? latest?.details ?? null,
    });
  }

  private overlayLiveTrackingEvents(
    shipment: ShipmentEntity,
    tracking: IShipwayTrackingResponse,
  ): ShipmentEntity {
    const scans = this.uniqueVisibleTrackingEvents(tracking.events ?? tracking.scans ?? []);
    if (scans.length === 0) {
      return shipment;
    }

    shipment.events = scans.map((event, index) =>
      this.toLiveShipmentEvent(shipment.id, event, index),
    );
    return shipment;
  }

  private uniqueVisibleTrackingEvents(events: IShipwayTrackingEvent[]): IShipwayTrackingEvent[] {
    const seen = new Set<string>();
    const unique: IShipwayTrackingEvent[] = [];

    for (const event of events) {
      const status = (event.status || event.status_detail || event.message || event.details || '')
        .trim()
        .toLowerCase();
      if (HIDDEN_SHIPWAY_SCAN_STATUSES.has(status)) {
        continue;
      }

      const happenedAt = this.parseEventDate(event.status_date ?? event.time);
      const key = [
        status,
        (event.location ?? '').trim().toLowerCase(),
        happenedAt?.toISOString() ?? '',
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(event);
    }

    return unique;
  }

  private toLiveShipmentEvent(
    shipmentId: string,
    event: IShipwayTrackingEvent,
    index: number,
  ): ShipmentEventEntity {
    const happenedAt = this.parseEventDate(event.status_date ?? event.time);
    const description =
      event.message ?? event.status_detail ?? event.details ?? event.activity ?? null;
    const status = (event.status || description || 'Update').trim() || 'Update';

    return {
      id: `${shipmentId}-live-${index}`,
      refId: `live-${index}`,
      shipmentId,
      status,
      description,
      location: event.location?.trim() || null,
      happenedAt,
      source: 'polling',
      createdAt: happenedAt ?? new Date(),
      updatedAt: happenedAt ?? new Date(),
      createdBy: 'shipway-live',
      updatedBy: 'shipway-live',
    } as ShipmentEventEntity;
  }

  private parseEventDate(value?: string | null): Date | null {
    if (!value?.trim()) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async recordTrackingEvents(
    shipmentId: string,
    events: IShipwayTrackingEvent[],
    source: string,
    manager: Parameters<ShipmentEventsRepository['create']>[1],
  ) {
    const existing = await this.shipmentEventsRepository.findByShipmentId(shipmentId, manager);
    const seen = new Set(
      existing.map(
        (event) =>
          `${event.status}|${event.happenedAt?.toISOString() ?? ''}|${event.location ?? ''}|${event.description ?? ''}`,
      ),
    );

    for (const event of this.uniqueVisibleTrackingEvents(events)) {
      const description =
        event.message ?? event.status_detail ?? event.details ?? event.activity ?? null;
      const status = (event.status || description || 'Update').trim() || 'Update';
      const happenedAt = this.parseEventDate(event.status_date ?? event.time);
      const location = event.location?.trim() || null;
      const key = `${status}|${happenedAt?.toISOString() ?? ''}|${location ?? ''}|${description ?? ''}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      await this.recordShipmentEvent(
        shipmentId,
        { ...event, status, message: description ?? undefined, location: location ?? undefined },
        source,
        manager,
      );
    }
  }

  private async recordShipmentEvent(
    shipmentId: string,
    event: IShipwayTrackingEvent,
    source: string,
    manager: Parameters<ShipmentEventsRepository['create']>[1],
  ) {
    await this.shipmentEventsRepository.create(
      {
        refId: await generateUniqueRefId('shipment-event', (candidate) =>
          this.shipmentEventsRepository.existsByRefId(candidate),
        ),
        shipmentId,
        status: event.status,
        description: event.message ?? event.activity ?? event.status_detail ?? event.details ?? null,
        location: event.location ?? null,
        happenedAt: this.parseEventDate(event.status_date ?? event.time),
        source,
        createdBy: source,
        updatedBy: source,
      },
      manager,
    );
  }

  private async syncOrderStatus(
    orderId: string,
    shipmentStatus: ShipmentStatus,
    manager: Parameters<OrdersRepository['updateById']>[2],
  ) {
    const orderStatus = ShipwayStatusMapper.toOrderStatus(shipmentStatus);
    if (orderStatus) {
      this.logger.log(
        { orderId, shipmentStatus, orderStatus },
        '[Shipway] Syncing orderStatus from shipmentStatus',
      );
      await this.ordersRepository.updateById(orderId, { orderStatus, updatedBy: 'shipway-sync' }, manager);
    } else {
      this.logger.log(
        { orderId, shipmentStatus, orderStatus: null },
        '[Shipway] No orderStatus mapping for shipmentStatus — order row unchanged',
      );
    }
  }

  private formatShipwayDate(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private getPositiveNumberConfig(key: string, fallback: number): number {
    const value = this.configService.get<number>(key);
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private toWeightGrams(value: string | null | undefined, unit: string | null | undefined): number | null {
    const parsed = this.toPositiveNumber(value);
    if (!parsed) return null;

    const normalizedUnit = unit?.trim().toLowerCase();
    switch (normalizedUnit) {
      case 'kg':
      case 'kilogram':
      case 'kilograms':
        return parsed * 1000;
      case 'mg':
      case 'milligram':
      case 'milligrams':
        return parsed / 1000;
      case 'lb':
      case 'lbs':
      case 'pound':
      case 'pounds':
        return parsed * 453.59237;
      case 'oz':
      case 'ounce':
      case 'ounces':
        return parsed * 28.349523125;
      case 'g':
      case 'gm':
      case 'gram':
      case 'grams':
      default:
        return parsed;
    }
  }

  private toLengthCm(value: string | null | undefined, unit: string | null | undefined): number | null {
    const parsed = this.toPositiveNumber(value);
    if (!parsed) return null;

    const normalizedUnit = unit?.trim().toLowerCase();
    switch (normalizedUnit) {
      case 'mm':
      case 'millimeter':
      case 'millimeters':
        return parsed / 10;
      case 'm':
      case 'meter':
      case 'meters':
        return parsed * 100;
      case 'in':
      case 'inch':
      case 'inches':
        return parsed * 2.54;
      case 'ft':
      case 'foot':
      case 'feet':
        return parsed * 30.48;
      case 'cm':
      case 'centimeter':
      case 'centimeters':
      default:
        return parsed;
    }
  }

  private toPositiveNumber(value: string | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }

  /** Safe push payload for logs — no phone/email/full address. */
  private summarizeShipwayPushPayload(payload: IShipwayPushOrderPayload): Record<string, unknown> {
    return {
      order_id: payload.order_id,
      payment_type: payload.payment_type,
      productCount: payload.products?.length ?? 0,
      products: (payload.products ?? []).map((product) => ({
        product_code: product.product_code,
        product_quantity: product.product_quantity,
        price: product.price,
      })),
      shipping_city: payload.shipping_city,
      shipping_state: payload.shipping_state,
      shipping_zipcode: payload.shipping_zipcode,
      hasShippingPhone: Boolean(payload.shipping_phone?.trim()),
      hasEmail: Boolean(payload.email?.trim()),
      order_total: payload.order_total,
      discount: payload.discount,
      shipping: payload.shipping,
      order_weight: payload.order_weight,
      box_length: payload.box_length,
      box_breadth: payload.box_breadth,
      box_height: payload.box_height,
      carrierIdPresent: Object.prototype.hasOwnProperty.call(payload, 'carrier_id'),
      carrier_id: payload.carrier_id ?? null,
      warehouse_id: payload.warehouse_id ?? null,
      return_warehouse_id: payload.return_warehouse_id ?? null,
      order_date: payload.order_date ?? null,
    };
  }

  private summarizeShipwayPushResponse(response: IShipwayPushOrderResponse): Record<string, unknown> {
    return {
      success: response.success,
      message: response.message,
      awb_number: response.awb_number ?? null,
      courier_name: response.courier_name ?? null,
      courier_id: response.courier_id ?? null,
      shipment_id: response.shipment_id ?? null,
      tracking_url: response.tracking_url ?? null,
      label_url: response.label_url ?? null,
      invoice_url: response.invoice_url ?? null,
      pickup_id: response.pickup_id ?? null,
    };
  }

  private toNullableString(value: string | number | undefined): string | null {
    return value === undefined || value === null ? null : String(value);
  }

  private buildWebhookIdempotencyKey(payload: IShipwayWebhookEvent): string {
    if (payload.event_id?.trim()) {
      return `eid:${payload.event_id.trim()}`;
    }
    const fingerprint = [
      payload.order_id,
      payload.awb_number ?? '',
      payload.status,
      payload.status_date ?? '',
      payload.message ?? '',
    ].join('|');
    return `fp:${createHash('sha256').update(fingerprint).digest('hex').slice(0, 40)}`;
  }

  private latestEventHappenedAt(shipment: ShipmentEntity): Date | null {
    const times = (shipment.events ?? [])
      .map((event) => event.happenedAt)
      .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()));
    if (!times.length) return null;
    return times.reduce((latest, current) => (current > latest ? current : latest));
  }

  private isLocalShipmentFresh(shipment: ShipmentEntity): boolean {
    if (!shipment.lastSyncedAt) return false;
    const freshMs = this.configService.get<number>('shipway.webhookFreshMs') ?? 15 * 60 * 1000;
    if (freshMs <= 0) return false;
    const ageMs = Date.now() - shipment.lastSyncedAt.getTime();
    if (ageMs < 0 || ageMs > freshMs) return false;
    // Prefer DB after webhook pushes; also allow recent polling syncs.
    return (
      shipment.updatedBy === 'shipway-webhook' ||
      Boolean(shipment.lastWebhookEventId) ||
      shipment.updatedBy === 'shipway-sync'
    );
  }
}
