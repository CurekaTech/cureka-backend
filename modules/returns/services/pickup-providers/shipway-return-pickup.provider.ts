import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShipwayService } from '@modules/shipping/services/shipway.service';
import { IShipwayPushOrderPayload } from '@modules/shipping/interfaces/shipway-api.interface';
import { PICKUP_ADDRESS_REQUIRED } from '../../constants/return.constants';
import { ReturnPickupProvider } from '../../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../../enums/return-pickup-status.enum';
import {
  IReturnPickupProviderAdapter,
  IReturnPickupScheduleRequest,
  IReturnPickupScheduleResult,
} from '../../interfaces/return-pickup-provider.interface';

/**
 * Books a reverse pickup through the same documented Shipway order API used
 * for forward fulfilment: POST /api/v2orders.
 *
 * The reverse order id is the Cureka return number so inbound Shipway webhooks
 * can be matched without colliding with the original forward shipment.
 */
@Injectable()
export class ShipwayReturnPickupProvider implements IReturnPickupProviderAdapter {
  private readonly logger = new Logger(ShipwayReturnPickupProvider.name);
  readonly provider = ReturnPickupProvider.SHIPWAY;

  constructor(
    private readonly shipwayService: ShipwayService,
    private readonly configService: ConfigService,
  ) {}

  get isEnabled(): boolean {
    return this.shipwayService.isConfigured();
  }

  async schedule(request: IReturnPickupScheduleRequest): Promise<IReturnPickupScheduleResult> {
    if (!this.isEnabled) {
      throw new Error('Shipway credentials are not configured');
    }
    if (!request.pickupAddress) {
      throw new BadRequestException({
        code: PICKUP_ADDRESS_REQUIRED,
        message: 'A pickup address is required to book a Shipway reverse pickup',
      });
    }

    const payload = this.buildPayload(request);
    this.logger.log(
      {
        api: 'POST /api/v2orders',
        shipwayOrderId: payload.order_id,
        returnNumber: request.returnNumber,
        originalOrderNumber: request.orderNumber,
        productCount: payload.products.length,
        warehouseId: payload.warehouse_id ?? null,
        carrierId: payload.carrier_id ?? null,
      },
      'Shipway reverse pickup push',
    );

    const response = await this.shipwayService.pushOrder(payload);
    if (!response.success) {
      throw new Error(response.message || 'Shipway rejected reverse pickup');
    }

    return {
      provider: this.provider,
      status: ReturnPickupStatus.SCHEDULED,
      providerPickupId: request.returnNumber,
      reverseAwbNumber: response.awb_number ?? null,
      courierName: response.courier_name ?? null,
      trackingUrl:
        response.tracking_url ??
        (response.awb_number ? `https://track.shipway.com/t/${response.awb_number}` : null),
      scheduledAt: request.scheduledAt ?? new Date(),
      providerPayload: {
        success: response.success,
        message: response.message,
        awb_number: response.awb_number ?? null,
        courier_name: response.courier_name ?? null,
        courier_id: response.courier_id ?? null,
        shipment_id: response.shipment_id ?? null,
        pickup_id: response.pickup_id ?? null,
        shipwayOrderId: request.returnNumber,
      },
    };
  }

  async cancel(params: { returnRequestId: string; reverseAwbNumber: string | null }): Promise<void> {
    if (!params.reverseAwbNumber) return;
    try {
      await this.shipwayService.cancelShipment({
        awb_number: params.reverseAwbNumber,
      });
    } catch (error) {
      this.logger.warn(
        {
          returnRequestId: params.returnRequestId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Shipway reverse pickup cancel failed',
      );
    }
  }

  private buildPayload(request: IReturnPickupScheduleRequest): IShipwayPushOrderPayload {
    const address = request.pickupAddress!;
    const [firstName, ...lastNameParts] = address.recipientName.trim().split(/\s+/);
    const warehouseId =
      this.configService.get<string>('shipway.returnWarehouseId') ||
      this.configService.get<string>('shipway.warehouseId') ||
      undefined;
    const reverseCarrierId = this.configService.get<number | undefined>('shipway.reverseCarrierId');
    const forwardCarrierId = this.configService.get<number | undefined>('shipway.carrierId');
    const carrierId = reverseCarrierId ?? forwardCarrierId;
    const includeReturnFlag = this.configService.get<boolean>('shipway.reverseFlagEnabled') === true;

    const payload: IShipwayPushOrderPayload = {
      order_id: request.returnNumber,
      payment_type: 'P',
      products: request.items.map((item) => ({
        product: item.productName,
        price: item.unitPrice ?? '0.00',
        product_code: item.sku,
        product_quantity: String(item.quantity),
      })),
      shipping_firstname: firstName || 'Customer',
      shipping_lastname: lastNameParts.join(' ') || undefined,
      shipping_phone: address.phoneNumber,
      shipping_address: address.addressLine1,
      shipping_address2: address.addressLine2 ?? undefined,
      shipping_city: address.city,
      shipping_state: address.state,
      shipping_zipcode: address.pincode,
      shipping_country: 'India',
      warehouse_id: warehouseId,
      return_warehouse_id: warehouseId,
      email: request.customerEmail ?? undefined,
      order_date: this.formatDate(new Date()),
    };

    if (carrierId !== undefined) {
      payload.carrier_id = carrierId;
    }
    if (includeReturnFlag) {
      payload.return = '1';
    }

    return payload;
  }

  private formatDate(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
}
