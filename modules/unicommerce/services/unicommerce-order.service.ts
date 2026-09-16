import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { isReadyForUnicommercePush } from '@modules/orders/utils/fulfillment-readiness.util';
import { mapOrderToUnicommercePayload } from '../mappers/unicommerce-order.mapper';
import {
  reconstructUnicommerceSaleOrderItemCodes,
  selectUnicommerceReversePickItemCodes,
} from '../mappers/unicommerce-reverse-pickup.mapper';
import {
  IUnicommerceCreateReversePickupResponse,
  IUnicommerceCreateSaleOrderResponse,
  IUnicommerceCancelSaleOrderResponse,
  IUnicommerceReversePickupAddress,
} from '../interfaces/unicommerce-order.interface';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';

export type UnicommerceReversePickupParams = {
  orderNumber: string;
  reversePickupCode: string;
  reason: string;
  items: Array<{ sku: string; quantity: number }>;
  originalOrderItems: Array<{ sku: string; quantity: number }>;
  pickupAddress: {
    recipientName: string;
    phoneNumber: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    state: string;
    pincode: string;
  } | null;
  customerEmail?: string | null;
  replacementSku?: string | null;
};

export type UnicommerceCancelSaleOrderParams = {
  orderNumber: string;
  reason: string;
  /** When set, cancels only those Uniware item codes (partial). */
  saleOrderItemCodes?: string[];
  cancelledBySeller?: boolean;
};

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

  isConfigured(): boolean {
    return this.apiService.isConfigured();
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
          orderSource: order.orderSource,
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
    const zeroPriceItems = payload.saleOrder.saleOrderItems
      .filter((item) => Number(item.sellingPrice || 0) === 0)
      .map((item) => ({
        sku: item.itemSku,
        sellingPrice: item.sellingPrice,
        totalPrice: item.totalPrice,
      }));
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
        orderSource: order.orderSource,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        itemCount: payload.saleOrder.saleOrderItems.length,
        skus,
        zeroPriceItemCount: zeroPriceItems.length,
        zeroPriceItems,
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
          zeroPriceItemCount: zeroPriceItems.length,
          zeroPriceItems,
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
          zeroPriceItemCount: zeroPriceItems.length,
          zeroPriceItems,
          successful: response.successful,
          message: response.message ?? 'no message',
          errors: response.errors,
        },
        'Unicommerce rejected order',
      );
    }

    return response;
  }

  /**
   * Registers a customer return in Uniware so the warehouse expects the item.
   * Uses the official reversePickup/create contract. Does not book a courier —
   * Shipway is still pushed independently, matching forward fulfilment.
   */
  async createReversePickup(
    params: UnicommerceReversePickupParams,
  ): Promise<IUnicommerceCreateReversePickupResponse> {
    if (!this.isEnabled()) {
      throw new Error('Unicommerce order push is disabled');
    }
    if (!this.apiService.isConfigured()) {
      throw new Error('Unicommerce credentials are not configured');
    }

    const saleOrderItems = await this.resolveSaleOrderItems(params);
    const saleOrderItemCodes = selectUnicommerceReversePickItemCodes(
      saleOrderItems,
      params.items,
    );
    const pickupAddress = this.mapPickupAddress(params.pickupAddress, params.customerEmail);
    const reason = params.reason.slice(0, 500);
    const facilityCode = this.configService.get<string>('unicommerceOrder.facilityCode') ?? '';

    const response = await this.apiService.createReversePickup({
      saleOrderCode: params.orderNumber,
      reversePickupCode: params.reversePickupCode,
      actionCode: 'WAC',
      reversePickItems: saleOrderItemCodes.map((saleOrderItemCode) => ({
        saleOrderItemCode,
        reason,
        ...(params.replacementSku
          ? {
              reversePickupAlternate: {
                itemSku: params.replacementSku,
              },
            }
          : {}),
      })),
      ...(pickupAddress
        ? { pickupAddress, shippingAddress: pickupAddress }
        : {}),
      pickupInstruction: `Cureka return ${params.reversePickupCode}`,
      ...(facilityCode ? { returnFacilityCode: facilityCode } : {}),
    });

    this.logger.log(
      {
        orderNumber: params.orderNumber,
        reversePickupCode: params.reversePickupCode,
        saleOrderItemCodes,
        successful: response.successful,
        message: response.message ?? null,
        ucReversePickupCode:
          response.reversePickupCode ?? response.reversePickupDTO?.code ?? null,
      },
      'Unicommerce reverse pickup create response',
    );

    return response;
  }

  /**
   * Cancels a sale order (or items) in Uniware before dispatch.
   * Additive side-effect for Cureka cancel — does not change local order status.
   * Returns null when Unicommerce push is disabled / not configured.
   */
  async cancelSaleOrder(
    params: UnicommerceCancelSaleOrderParams,
  ): Promise<IUnicommerceCancelSaleOrderResponse | null> {
    if (!this.isEnabled()) {
      this.logger.warn(
        { orderNumber: params.orderNumber },
        'Unicommerce order push disabled; skipping cancelSaleOrder',
      );
      return null;
    }
    if (!this.apiService.isConfigured()) {
      this.logger.error(
        { orderNumber: params.orderNumber },
        'Unicommerce credentials missing; cannot cancelSaleOrder',
      );
      return null;
    }

    const saleOrderItemCodes = params.saleOrderItemCodes?.filter(Boolean) ?? [];
    const cancelPartially = saleOrderItemCodes.length > 0;
    const cancelledBySeller = params.cancelledBySeller === true;
    const cancellationReason = params.reason.trim().slice(0, 100);

    // Uniware: either cancelOnChannel OR cancelledBySeller (not both).
    const response = await this.apiService.cancelSaleOrder({
      saleOrderCode: params.orderNumber,
      ...(cancelPartially
        ? { saleOrderItemCodes, cancelPartially: true }
        : { cancelPartially: false }),
      ...(cancelledBySeller ? { cancelledBySeller: true } : { cancelOnChannel: true }),
      ...(cancellationReason ? { cancellationReason } : {}),
    });

    this.logger.log(
      {
        orderNumber: params.orderNumber,
        cancelPartially,
        itemCount: saleOrderItemCodes.length,
        successful: response.successful,
        message: response.message ?? null,
        errors: response.errors,
      },
      'Unicommerce cancelSaleOrder response',
    );

    return response;
  }

  private async resolveSaleOrderItems(params: UnicommerceReversePickupParams) {
    try {
      const saleOrder = await this.apiService.getSaleOrder(params.orderNumber);
      const remoteItems = saleOrder.saleOrderDTO?.saleOrderItems ?? [];
      if (saleOrder.successful && remoteItems.length > 0) {
        return remoteItems;
      }
      this.logger.warn(
        {
          orderNumber: params.orderNumber,
          successful: saleOrder.successful,
          message: saleOrder.message ?? null,
        },
        'Unicommerce getSaleOrder returned no items — reconstructing codes from the original order',
      );
    } catch (error) {
      this.logger.warn(
        {
          orderNumber: params.orderNumber,
          error: error instanceof Error ? error.message : String(error),
        },
        'Unicommerce getSaleOrder failed — reconstructing codes from the original order',
      );
    }

    return reconstructUnicommerceSaleOrderItemCodes(
      params.orderNumber,
      params.originalOrderItems,
    );
  }

  private mapPickupAddress(
    address: UnicommerceReversePickupParams['pickupAddress'],
    email?: string | null,
  ): IUnicommerceReversePickupAddress | null {
    if (!address) return null;
    return {
      id: 'return-pickup',
      name: address.recipientName,
      addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? undefined,
      city: address.city,
      state: address.state,
      country: 'India',
      pincode: address.pincode,
      phone: address.phoneNumber,
      email: email ?? undefined,
    };
  }
}
