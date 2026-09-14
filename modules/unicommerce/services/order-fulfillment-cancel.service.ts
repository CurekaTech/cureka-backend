import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { CancellationStatus } from '@modules/orders/enums/cancellation-status.enum';
import { CancellationSyncStatus } from '@modules/orders/enums/cancellation-sync-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  OrderFulfillmentEventType,
  OrderFulfillmentRequestType,
} from '@modules/orders/enums/order-fulfillment-event-type.enum';
import { isShipmentDispatched } from '@modules/orders/constants/dispatched-shipment-statuses.constant';
import { applyOrderStatusTimestamps } from '@modules/orders/utils/order-status-timestamps.util';
import { OrderFulfillmentEventsRepository } from '@modules/orders/repositories/order-fulfillment-events.repository';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { OrderNotificationsService } from '@modules/notifications/services/order-notifications.service';
import { RefundRequestedByType } from '@modules/refund-requests/enums/refund-requested-by-type.enum';
import { RefundRequestsService } from '@modules/refund-requests/services/refund-request.service';
import { ShipmentStatus } from '@modules/shipping/enums/shipment-status.enum';
import { ShipmentsRepository } from '@modules/shipping/repositories/shipments.repository';
import { ShipwayService } from '@modules/shipping/services/shipway.service';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS, OrderCancelledEvent } from '@packages/events';
import { DataSource, EntityManager } from 'typeorm';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';
import { UnicommerceOrderQueueService } from './unicommerce-order-queue.service';
import { UnicommerceOrderService } from './unicommerce-order.service';

const DISPATCH_RE = /dispatch|dispatched|shipped|complete|already\s+ship/i;
const NOT_FOUND_RE = /not\s+found|does not exist|no sale order|saleorder.*not exist/i;

export type CancellationJobOutcome = {
  orderId: string;
  cancellationStatus: CancellationStatus;
  unicommerceStatus: CancellationSyncStatus;
  shipwayStatus: CancellationSyncStatus;
  retriable: boolean;
  message: string;
};

@Injectable()
export class OrderFulfillmentCancelService {
  private readonly logger = new Logger(OrderFulfillmentCancelService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly ordersRepository: OrdersRepository,
    private readonly eventsRepository: OrderFulfillmentEventsRepository,
    private readonly unicommerceApi: UnicommerceOrderApiService,
    private readonly unicommerceOrderService: UnicommerceOrderService,
    private readonly unicommerceQueue: UnicommerceOrderQueueService,
    private readonly shipmentsRepository: ShipmentsRepository,
    private readonly shipwayService: ShipwayService,
    @Inject(forwardRef(() => RefundRequestsService))
    private readonly refundRequestsService: RefundRequestsService,
    private readonly orderNotificationsService: OrderNotificationsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async processCancellation(orderId: string): Promise<CancellationJobOutcome> {
    const order = await this.ordersRepository.findByIdWithItems(orderId);
    if (!order) {
      return {
        orderId,
        cancellationStatus: CancellationStatus.REJECTED,
        unicommerceStatus: CancellationSyncStatus.NOT_REQUIRED,
        shipwayStatus: CancellationSyncStatus.NOT_REQUIRED,
        retriable: false,
        message: 'Order not found',
      };
    }

    if (
      order.cancellationStatus !== CancellationStatus.PROCESSING &&
      order.cancellationStatus !== CancellationStatus.REQUIRES_ATTENTION
    ) {
      return {
        orderId,
        cancellationStatus: order.cancellationStatus,
        unicommerceStatus: order.cancellationUnicommerceStatus,
        shipwayStatus: order.cancellationShipwayStatus,
        retriable: false,
        message: `Cancellation not in a processable state (${order.cancellationStatus})`,
      };
    }

    await this.ordersRepository.updateById(orderId, {
      cancellationAttemptCount: (order.cancellationAttemptCount ?? 0) + 1,
      cancellationLastAttemptAt: new Date(),
    });

    const uc = await this.cancelUnicommerce(order);
    const shipway = await this.cancelShipway(order);

    return this.persistCombinedOutcome(order, uc, shipway);
  }

  async retryCancellation(
    orderId: string,
    actor: { id: string; type: string },
  ): Promise<CancellationJobOutcome> {
    const order = await this.ordersRepository.findByIdWithItems(orderId);
    if (!order) {
      return {
        orderId,
        cancellationStatus: CancellationStatus.REJECTED,
        unicommerceStatus: CancellationSyncStatus.NOT_REQUIRED,
        shipwayStatus: CancellationSyncStatus.NOT_REQUIRED,
        retriable: false,
        message: 'Order not found',
      };
    }

    const retryable = new Set<CancellationStatus>([
      CancellationStatus.PROCESSING,
      CancellationStatus.REQUIRES_ATTENTION,
      CancellationStatus.HISTORICAL_UNVERIFIED,
    ]);
    if (!retryable.has(order.cancellationStatus)) {
      return {
        orderId,
        cancellationStatus: order.cancellationStatus,
        unicommerceStatus: order.cancellationUnicommerceStatus,
        shipwayStatus: order.cancellationShipwayStatus,
        retriable: false,
        message: `Retry is not allowed for cancellation status ${order.cancellationStatus}`,
      };
    }

    await this.eventsRepository.create({
      orderId,
      requestType: OrderFulfillmentRequestType.CANCELLATION,
      eventType: OrderFulfillmentEventType.ADMIN_RETRY,
      actorId: actor.id,
      actorType: actor.type,
      fromStatus: order.cancellationStatus,
      toStatus: CancellationStatus.PROCESSING,
      message: 'Admin retried an eligible cancellation integration step',
      isCustomerVisible: false,
    });

    await this.ordersRepository.updateById(orderId, {
      cancellationStatus: CancellationStatus.PROCESSING,
      cancellationUnicommerceStatus:
        order.cancellationUnicommerceStatus === CancellationSyncStatus.CONFIRMED ||
        order.cancellationUnicommerceStatus === CancellationSyncStatus.NOT_REQUIRED
          ? order.cancellationUnicommerceStatus
          : CancellationSyncStatus.PENDING,
      cancellationShipwayStatus:
        order.cancellationShipwayStatus === CancellationSyncStatus.CONFIRMED ||
        order.cancellationShipwayStatus === CancellationSyncStatus.NOT_REQUIRED
          ? order.cancellationShipwayStatus
          : CancellationSyncStatus.PENDING,
      cancellationSyncError: null,
      updatedBy: actor.id,
    });

    await this.unicommerceQueue.enqueueCancelOrder(orderId);
    return {
      orderId,
      cancellationStatus: CancellationStatus.PROCESSING,
      unicommerceStatus: CancellationSyncStatus.PENDING,
      shipwayStatus: CancellationSyncStatus.PENDING,
      retriable: false,
      message: 'Cancellation retry queued',
    };
  }

  private async cancelUnicommerce(order: OrderEntity): Promise<{
    status: CancellationSyncStatus;
    retriable: boolean;
    message: string;
    eventType: OrderFulfillmentEventType;
  }> {
    if (
      order.cancellationUnicommerceStatus === CancellationSyncStatus.CONFIRMED ||
      order.cancellationUnicommerceStatus === CancellationSyncStatus.NOT_REQUIRED
    ) {
      return {
        status: order.cancellationUnicommerceStatus,
        retriable: false,
        message: 'Unicommerce cancellation already settled',
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_SKIPPED,
      };
    }

    if (!this.unicommerceOrderService.isEnabled()) {
      return {
        status: CancellationSyncStatus.NOT_REQUIRED,
        retriable: false,
        message: 'Unicommerce order push is disabled — no remote sale order to cancel',
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_SKIPPED,
      };
    }

    if (!this.unicommerceApi.isConfigured()) {
      return {
        status: CancellationSyncStatus.UNSUPPORTED,
        retriable: false,
        message:
          'Unicommerce credentials are not configured. Cannot cancel a remote sale order. Admin must complete Uniware cancellation or supply credentials.',
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_FAILED,
      };
    }

    const pushState = await this.unicommerceQueue.getPushJobState(order.id);

    let remote: Awaited<ReturnType<UnicommerceOrderApiService['getSaleOrder']>> | null = null;
    try {
      remote = await this.unicommerceApi.getSaleOrder(order.orderNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out/i.test(message)) {
        return {
          status: CancellationSyncStatus.UNCERTAIN,
          retriable: true,
          message: `Unicommerce getSaleOrder timed out: ${message}`,
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_UNCERTAIN,
        };
      }
      if (pushState === 'active' || pushState === 'waiting' || pushState === 'delayed') {
        return {
          status: CancellationSyncStatus.UNCERTAIN,
          retriable: true,
          message: `Unicommerce lookup failed while a push job is ${pushState}; remote order may still appear`,
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_UNCERTAIN,
        };
      }
      return {
        status: CancellationSyncStatus.FAILED,
        retriable: true,
        message: `Unicommerce getSaleOrder failed: ${message}`,
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_FAILED,
      };
    }

    const remoteStatus = remote.saleOrderDTO?.status ?? '';
    if (remote.successful && /cancel/i.test(remoteStatus)) {
      return {
        status: CancellationSyncStatus.CONFIRMED,
        retriable: false,
        message: `Unicommerce sale order already cancelled (${remoteStatus})`,
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_CONFIRMED,
      };
    }

    if (!remote.successful || !remote.saleOrderDTO?.code) {
      const lookupMessage = this.formatUnicommerceErrors(remote.message, remote.errors);
      if (NOT_FOUND_RE.test(lookupMessage) || !remote.saleOrderDTO) {
        if (pushState === 'active' || pushState === 'waiting' || pushState === 'delayed') {
          return {
            status: CancellationSyncStatus.UNCERTAIN,
            retriable: true,
            message:
              'Unicommerce sale order not found yet, but a push job is still in flight. Not treating as final.',
            eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_UNCERTAIN,
          };
        }
        return {
          status: CancellationSyncStatus.NOT_REQUIRED,
          retriable: false,
          message: 'No Unicommerce sale order exists for this Cureka order',
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_SKIPPED,
        };
      }
    }

    const reason = (order.cancelReason ?? 'Customer requested cancellation').slice(0, 100);
    try {
      await this.eventsRepository.create({
        orderId: order.id,
        requestType: OrderFulfillmentRequestType.CANCELLATION,
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_SENT,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        message: 'Posted Unicommerce saleOrder/cancel',
        metadata: { saleOrderCode: order.orderNumber },
      });

      const response = await this.unicommerceApi.cancelSaleOrder({
        saleOrderCode: order.orderNumber,
        cancelPartially: false,
        cancelOnChannel: false,
        cancelledBySeller: true,
        cancellationReason: reason,
      });

      if (response.successful) {
        return {
          status: CancellationSyncStatus.CONFIRMED,
          retriable: false,
          message: response.message ?? 'Unicommerce accepted cancellation',
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_CONFIRMED,
        };
      }

      const failure = this.formatUnicommerceErrors(response.message, response.errors);
      if (DISPATCH_RE.test(failure)) {
        return {
          status: CancellationSyncStatus.REJECTED,
          retriable: false,
          message: failure || 'Unicommerce rejected cancellation because the order is already dispatched',
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_FAILED,
        };
      }

      return {
        status: CancellationSyncStatus.FAILED,
        retriable: true,
        message: failure || 'Unicommerce returned successful=false for saleOrder/cancel',
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_FAILED,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out/i.test(message)) {
        return {
          status: CancellationSyncStatus.UNCERTAIN,
          retriable: true,
          message: `Unicommerce cancelSaleOrder timed out after a possible provider success: ${message}`,
          eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_UNCERTAIN,
        };
      }
      return {
        status: CancellationSyncStatus.FAILED,
        retriable: true,
        message,
        eventType: OrderFulfillmentEventType.UNICOMMERCE_CANCEL_FAILED,
      };
    }
  }

  private async cancelShipway(order: OrderEntity): Promise<{
    status: CancellationSyncStatus;
    retriable: boolean;
    message: string;
    eventType: OrderFulfillmentEventType;
  }> {
    if (
      order.cancellationShipwayStatus === CancellationSyncStatus.CONFIRMED ||
      order.cancellationShipwayStatus === CancellationSyncStatus.NOT_REQUIRED
    ) {
      return {
        status: order.cancellationShipwayStatus,
        retriable: false,
        message: 'Shipway cancellation already settled',
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_SKIPPED,
      };
    }

    const shipment = await this.shipmentsRepository.findByOrderId(order.id);
    if (!shipment) {
      return {
        status: CancellationSyncStatus.NOT_REQUIRED,
        retriable: false,
        message: 'No Shipway shipment row exists for this order',
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_SKIPPED,
      };
    }

    if (shipment.shipmentStatus === ShipmentStatus.CANCELLED) {
      return {
        status: CancellationSyncStatus.CONFIRMED,
        retriable: false,
        message: 'Local shipment already marked CANCELLED',
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_CONFIRMED,
      };
    }

    if (isShipmentDispatched(shipment.shipmentStatus)) {
      return {
        status: CancellationSyncStatus.REJECTED,
        retriable: false,
        message: `Shipway shipment is already ${shipment.shipmentStatus}; pre-dispatch cancel is not possible`,
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_FAILED,
      };
    }

    if (!shipment.awbNumber) {
      return {
        status: CancellationSyncStatus.NOT_REQUIRED,
        retriable: false,
        message:
          'Shipway shipment exists without an AWB. POST /api/cancel requires awb_number; tracking-record deletion is not courier cancellation.',
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_SKIPPED,
      };
    }

    if (!this.shipwayService.isConfigured()) {
      return {
        status: CancellationSyncStatus.UNSUPPORTED,
        retriable: false,
        message:
          'Shipway credentials are not configured. Cannot cancel the courier booking. Admin must cancel the AWB in Shipway.',
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_FAILED,
      };
    }

    try {
      await this.eventsRepository.create({
        orderId: order.id,
        requestType: OrderFulfillmentRequestType.CANCELLATION,
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_SENT,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        message: 'Posted Shipway /api/cancel',
        metadata: { awbNumber: shipment.awbNumber, courierId: shipment.courierId },
      });

      const response = await this.shipwayService.cancelShipment({
        awb_number: shipment.awbNumber,
        courier_id: shipment.courierId ?? undefined,
        reason: (order.cancelReason ?? 'Customer requested cancellation').slice(0, 200),
      });

      if (response.success) {
        shipment.shipmentStatus = ShipmentStatus.CANCELLED;
        shipment.updatedBy = 'order-cancel';
        await this.shipmentsRepository.save(shipment);
        return {
          status: CancellationSyncStatus.CONFIRMED,
          retriable: false,
          message: response.message || 'Shipway accepted shipment cancellation',
          eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_CONFIRMED,
        };
      }

      const failure = response.message || 'Shipway returned success=false for /api/cancel';
      if (DISPATCH_RE.test(failure)) {
        return {
          status: CancellationSyncStatus.REJECTED,
          retriable: false,
          message: failure,
          eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_FAILED,
        };
      }

      return {
        status: CancellationSyncStatus.FAILED,
        retriable: true,
        message: failure,
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_FAILED,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out|abort/i.test(message)) {
        return {
          status: CancellationSyncStatus.UNCERTAIN,
          retriable: true,
          message: `Shipway /api/cancel timed out after a possible provider success: ${message}`,
          eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_UNCERTAIN,
        };
      }
      return {
        status: CancellationSyncStatus.FAILED,
        retriable: true,
        message,
        eventType: OrderFulfillmentEventType.SHIPWAY_CANCEL_FAILED,
      };
    }
  }

  private async persistCombinedOutcome(
    order: OrderEntity,
    uc: {
      status: CancellationSyncStatus;
      retriable: boolean;
      message: string;
      eventType: OrderFulfillmentEventType;
    },
    shipway: {
      status: CancellationSyncStatus;
      retriable: boolean;
      message: string;
      eventType: OrderFulfillmentEventType;
    },
  ): Promise<CancellationJobOutcome> {
    await this.eventsRepository.create({
      orderId: order.id,
      requestType: OrderFulfillmentRequestType.CANCELLATION,
      eventType: uc.eventType,
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fromStatus: order.cancellationUnicommerceStatus,
      toStatus: uc.status,
      message: uc.message,
    });
    await this.eventsRepository.create({
      orderId: order.id,
      requestType: OrderFulfillmentRequestType.CANCELLATION,
      eventType: shipway.eventType,
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fromStatus: order.cancellationShipwayStatus,
      toStatus: shipway.status,
      message: shipway.message,
    });

    const stepOk = (status: CancellationSyncStatus) =>
      status === CancellationSyncStatus.CONFIRMED ||
      status === CancellationSyncStatus.NOT_REQUIRED;

    const anyRejected =
      uc.status === CancellationSyncStatus.REJECTED ||
      shipway.status === CancellationSyncStatus.REJECTED;
    const anyUnsupported =
      uc.status === CancellationSyncStatus.UNSUPPORTED ||
      shipway.status === CancellationSyncStatus.UNSUPPORTED;
    const anyUncertain =
      uc.status === CancellationSyncStatus.UNCERTAIN ||
      shipway.status === CancellationSyncStatus.UNCERTAIN;
    const anyFailed =
      uc.status === CancellationSyncStatus.FAILED ||
      shipway.status === CancellationSyncStatus.FAILED;

    let cancellationStatus = CancellationStatus.PROCESSING;
    let retriable = false;
    let message = `Unicommerce: ${uc.message}. Shipway: ${shipway.message}`;

    if (stepOk(uc.status) && stepOk(shipway.status)) {
      cancellationStatus = CancellationStatus.CONFIRMED;
      message = 'All applicable fulfilment cancellation steps confirmed';
      await this.confirmLocalCancellation(order, uc.status, shipway.status);
    } else if (anyRejected) {
      cancellationStatus = CancellationStatus.REQUIRES_ATTENTION;
      message =
        'A fulfilment provider rejected cancellation (likely already dispatched). Order is not marked cancelled. Ops must use RTO/interception if authorized — do not book a delivered-order return pickup for goods still in transit.';
      await this.ordersRepository.updateById(order.id, {
        cancellationStatus,
        cancellationUnicommerceStatus: uc.status,
        cancellationShipwayStatus: shipway.status,
        cancellationSyncError: message,
      });
      await this.eventsRepository.create({
        orderId: order.id,
        requestType: OrderFulfillmentRequestType.CANCELLATION,
        eventType: OrderFulfillmentEventType.CANCELLATION_REQUIRES_ATTENTION,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        fromStatus: order.cancellationStatus,
        toStatus: cancellationStatus,
        message,
        isCustomerVisible: true,
      });
    } else if (anyUnsupported || anyUncertain || anyFailed) {
      cancellationStatus = CancellationStatus.REQUIRES_ATTENTION;
      retriable = uc.retriable || shipway.retriable;
      await this.ordersRepository.updateById(order.id, {
        cancellationStatus,
        cancellationUnicommerceStatus: uc.status,
        cancellationShipwayStatus: shipway.status,
        cancellationSyncError: message,
      });
      await this.eventsRepository.create({
        orderId: order.id,
        requestType: OrderFulfillmentRequestType.CANCELLATION,
        eventType: OrderFulfillmentEventType.CANCELLATION_REQUIRES_ATTENTION,
        actorId: 'SYSTEM',
        actorType: 'SYSTEM',
        fromStatus: order.cancellationStatus,
        toStatus: cancellationStatus,
        message,
      });
    } else {
      await this.ordersRepository.updateById(order.id, {
        cancellationUnicommerceStatus: uc.status,
        cancellationShipwayStatus: shipway.status,
        cancellationSyncError: message,
      });
    }

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        cancellationStatus,
        unicommerceStatus: uc.status,
        shipwayStatus: shipway.status,
        retriable,
      },
      'Fulfilment cancellation step finished',
    );

    return {
      orderId: order.id,
      cancellationStatus,
      unicommerceStatus: uc.status,
      shipwayStatus: shipway.status,
      retriable,
      message,
    };
  }

  private async confirmLocalCancellation(
    order: OrderEntity,
    unicommerceStatus: CancellationSyncStatus,
    shipwayStatus: CancellationSyncStatus,
  ): Promise<void> {
    const alreadyCancelled = order.orderStatus === OrderStatus.CANCELLED;
    await this.dataSource.transaction(async (manager) => {
      const locked = await manager
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id: order.id })
        .getOne();
      if (!locked) return;

      if (!alreadyCancelled && locked.orderStatus !== OrderStatus.CANCELLED) {
        if (
          locked.orderStatus === OrderStatus.CONFIRMED ||
          locked.orderStatus === OrderStatus.PROCESSING
        ) {
          await this.restoreStockAndCoupon(manager, order.id);
        }
        await this.ordersRepository.updateById(
          order.id,
          {
            orderStatus: OrderStatus.CANCELLED,
            ...applyOrderStatusTimestamps(locked, OrderStatus.CANCELLED, new Date()),
            cancellationStatus: CancellationStatus.CONFIRMED,
            cancellationUnicommerceStatus: unicommerceStatus,
            cancellationShipwayStatus: shipwayStatus,
            cancellationSyncError: null,
            updatedBy: 'system-cancel',
          },
          manager,
        );
      } else {
        await this.ordersRepository.updateById(
          order.id,
          {
            cancellationStatus: CancellationStatus.CONFIRMED,
            cancellationUnicommerceStatus: unicommerceStatus,
            cancellationShipwayStatus: shipwayStatus,
            cancellationSyncError: null,
          },
          manager,
        );
      }
    });

    await this.eventsRepository.create({
      orderId: order.id,
      requestType: OrderFulfillmentRequestType.CANCELLATION,
      eventType: OrderFulfillmentEventType.CANCELLATION_CONFIRMED,
      actorId: 'SYSTEM',
      actorType: 'SYSTEM',
      fromStatus: order.cancellationStatus,
      toStatus: CancellationStatus.CONFIRMED,
      message: 'Cancellation confirmed after applicable fulfilment steps',
      isCustomerVisible: true,
    });

    const fresh = await this.ordersRepository.findByIdWithItems(order.id);
    if (!fresh) return;

    await this.createRefundRequestSafely(fresh);
    await this.eventEmitter.emitAsync(
      EVENTS.ORDER_CANCELLED,
      new OrderCancelledEvent(fresh.id, fresh.orderNumber, fresh.cancelReason ?? ''),
    );
    await this.notifyCancelledSafely(fresh);
  }

  private async restoreStockAndCoupon(manager: EntityManager, orderId: string): Promise<void> {
    const items = await manager.getRepository(OrderItemEntity).find({ where: { orderId } });
    for (const item of items) {
      await manager
        .getRepository(ProductVariantEntity)
        .createQueryBuilder()
        .update(ProductVariantEntity)
        .set({ stock: () => `"stock" + ${item.quantity}` })
        .where('id = :variantId', { variantId: item.variantId })
        .execute();
    }
    await manager.getRepository(CouponUsageEntity).delete({ orderId });
  }

  private async createRefundRequestSafely(order: OrderEntity): Promise<void> {
    try {
      await this.refundRequestsService.createFromOrderCancellation(
        order,
        {
          id: order.cancellationRequestedBy ?? 'SYSTEM',
          type:
            order.cancellationRequestedByType === 'ADMIN'
              ? RefundRequestedByType.ADMIN
              : RefundRequestedByType.CUSTOMER,
        },
        order.cancelReason ?? 'Order cancelled',
      );
    } catch (error) {
      this.logger.error(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          err: error instanceof Error ? error.message : String(error),
        },
        'Failed to create refund request after confirmed cancellation (non-blocking)',
      );
    }
  }

  private async notifyCancelledSafely(order: OrderEntity): Promise<void> {
    try {
      await this.orderNotificationsService.notifyOrderCancelledSafely({
        phoneNumber: order.phoneNumber,
        customerName: order.recipientName,
        orderNumber: order.orderNumber,
        grandTotal: String(order.grandTotal ?? ''),
        paymentMethod: String(order.paymentMethod ?? ''),
        orderStatus: String(OrderStatus.CANCELLED),
        cancelReason: order.cancelReason ?? '',
        source: 'fulfillment-cancel',
      });
    } catch (error) {
      this.logger.warn(
        {
          orderId: order.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Order-cancelled notification failed (non-blocking)',
      );
    }
  }

  private formatUnicommerceErrors(
    message?: string,
    errors?: Array<{ description?: string; message?: string }>,
  ): string {
    const parts = [
      message,
      ...(errors ?? []).map((error) => error.description ?? error.message).filter(Boolean),
    ].filter(Boolean);
    return parts.join('; ') || '';
  }
}
