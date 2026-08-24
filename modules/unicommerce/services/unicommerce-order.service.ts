import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { isReadyForUnicommercePush } from '@modules/orders/utils/fulfillment-readiness.util';
import { mapOrderToUnicommercePayload } from '../mappers/unicommerce-order.mapper';
import { IUnicommerceCreateSaleOrderResponse } from '../interfaces/unicommerce-order.interface';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';

@Injectable()
export class UnicommerceOrderService implements OnModuleInit {
  private readonly logger = new Logger(UnicommerceOrderService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersRepository: OrdersRepository,
    private readonly apiService: UnicommerceOrderApiService,
  ) {}

  onModuleInit(): void {
    const enabled = this.isEnabled();
    const configured = this.apiService.isConfigured();
    const tenant = this.configService.get<string>('unicommerceOrder.tenant') ?? '';
    const channel = this.configService.get<string>('unicommerceOrder.channel') ?? '';
    const facilityCode = this.configService.get<string>('unicommerceOrder.facilityCode') ?? '';
    const username = this.configService.get<string>('unicommerceOrder.username') ?? '';

    this.logger.log(
      {
        enabled,
        configured,
        tenant,
        baseUrl: `https://${tenant}.unicommerce.com`,
        channel,
        facilityCode,
        username,
      },
      'Unicommerce order push startup configuration',
    );

    if (!enabled) {
      this.logger.warn(
        'Unicommerce order push is DISABLED (UNICOMMERCE_ORDER_PUSH_ENABLED=false). ' +
          'Orders will not be sent to Unicommerce until this is set to true.',
      );
      return;
    }

    if (!configured) {
      this.logger.warn(
        'Unicommerce order push is ENABLED but credentials are incomplete. ' +
          'Set UNICOMMERCE_TENANT, UNICOMMERCE_USERNAME, and UNICOMMERCE_PASSWORD.',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('unicommerceOrder.enabled'));
  }

  async pushOrder(orderId: string): Promise<IUnicommerceCreateSaleOrderResponse | null> {
    if (!this.isEnabled()) {
      this.logger.warn(`Unicommerce order push disabled; skipping order ${orderId}`);
      return null;
    }

    if (!this.apiService.isConfigured()) {
      this.logger.error(
        `Unicommerce credentials missing; cannot push order ${orderId}. ` +
          'Check UNICOMMERCE_TENANT, UNICOMMERCE_USERNAME, UNICOMMERCE_PASSWORD.',
      );
      return null;
    }

    const order = await this.ordersRepository.findForUnicommercePush(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (!isReadyForUnicommercePush(order)) {
      this.logger.warn(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
        },
        'Unicommerce push skipped — order not ready (prepaid requires PAID/PARTIALLY_PAID and non-PENDING order status; COD requires non-PENDING)',
      );
      return null;
    }

    const payload = mapOrderToUnicommercePayload(order, {
      currency: this.configService.get<string>('unicommerceOrder.currency'),
      channel: this.configService.get<string>('unicommerceOrder.channel'),
    });

    const skus = payload.saleOrder.saleOrderItems.map((item) => item.itemSku);
    const itemsSubtotal = payload.saleOrder.saleOrderItems.reduce(
      (sum, item) => sum + Number(item.sellingPrice || 0),
      0,
    );
    const ucOrderAmount =
      itemsSubtotal +
      (payload.saleOrder.totalShippingCharges ?? 0) +
      (payload.saleOrder.totalCashOnDeliveryCharges ?? 0) -
      (payload.saleOrder.totalDiscount ?? 0);

    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        itemCount: payload.saleOrder.saleOrderItems.length,
        skus,
        channel: payload.saleOrder.channel,
        cashOnDelivery: payload.saleOrder.cashOnDelivery,
        paymentInstrument: payload.saleOrder.paymentInstrument,
        thirdPartyShipping: payload.saleOrder.thirdPartyShipping,
        curekaGrandTotal: order.grandTotal,
        couponCode: order.couponCode,
        couponTitle: order.couponTitle,
        discountAmount: order.discountAmount,
        prepaidDiscount: order.prepaidDiscount,
        additionalInfo: payload.saleOrder.additionalInfo ?? null,
        itemsSubtotal,
        totalDiscount: payload.saleOrder.totalDiscount,
        totalShippingCharges: payload.saleOrder.totalShippingCharges,
        totalCashOnDeliveryCharges: payload.saleOrder.totalCashOnDeliveryCharges,
        totalPrepaidAmount: payload.saleOrder.totalPrepaidAmount,
        ucOrderAmount: Math.round(ucOrderAmount * 100) / 100,
        prepaidReconciles:
          payload.saleOrder.cashOnDelivery ||
          Math.abs((payload.saleOrder.totalPrepaidAmount ?? 0) - ucOrderAmount) < 0.01,
        step: 'unicommerce-push',
        note: 'Independent of Shipway — Cureka pushes OMS and courier separately',
      },
      '[FULFILLMENT] Pushing order to Unicommerce',
    );

    const response = await this.apiService.createSaleOrder(payload);

    if (response.successful) {
      this.logger.log(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          skus,
          ucOrderCode: response.saleOrderDetailDTO?.code,
          ucStatus: response.saleOrderDetailDTO?.status,
        },
        'Unicommerce accepted order',
      );
    } else {
      this.logger.warn(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          skus,
          successful: response.successful,
          message: response.message ?? 'no message',
          errors: response.errors,
        },
        'Unicommerce rejected order',
      );
    }

    return response;
  }
}
