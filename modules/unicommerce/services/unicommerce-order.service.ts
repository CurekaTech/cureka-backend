import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { mapOrderToUnicommercePayload } from '../mappers/unicommerce-order.mapper';
import { IUnicommercePostOrderResponse } from '../interfaces/unicommerce-order.interface';
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
    const baseUrl = this.configService.get<string>('unicommerceOrder.baseUrl') ?? '';
    const clientId = this.configService.get<string>('unicommerceOrder.clientId') ?? '';
    const merchantId = this.configService.get<string>('unicommerceOrder.merchantId') ?? '';
    const securityKey = this.configService.get<string>('unicommerceOrder.securityKey') ?? '';

    this.logger.log(
      {
        enabled,
        configured,
        baseUrl,
        clientId,
        merchantId,
        facilityCode: '(omitted — order-create check)',
        securityKeySet: Boolean(securityKey),
      },
      'UniCommerce order push startup configuration',
    );

    if (!enabled) {
      this.logger.warn(
        'UniCommerce order push is DISABLED (UNICOMMERCE_ORDER_PUSH_ENABLED=false). ' +
          'Orders will not be enqueued or sent to UniCommerce until this is set to true.',
      );
      return;
    }

    if (!configured) {
      this.logger.warn(
        'UniCommerce order push is ENABLED but credentials are incomplete. ' +
          'Set UNICOMMERCE_ORDER_CLIENT_ID, UNICOMMERCE_ORDER_MERCHANT_ID, and UNICOMMERCE_ORDER_SECURITY_KEY.',
      );
    }
  }

  isEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('unicommerceOrder.enabled'));
  }

  async pushOrder(orderId: string): Promise<IUnicommercePostOrderResponse | null> {
    if (!this.isEnabled()) {
      this.logger.warn(
        `UniCommerce order push disabled (UNICOMMERCE_ORDER_PUSH_ENABLED=false); skipping order ${orderId}`,
      );
      return null;
    }

    if (!this.apiService.isConfigured()) {
      this.logger.error(
        `UniCommerce credentials missing; cannot push order ${orderId}. ` +
          'Check UNICOMMERCE_ORDER_CLIENT_ID, UNICOMMERCE_ORDER_MERCHANT_ID, UNICOMMERCE_ORDER_SECURITY_KEY.',
      );
      return null;
    }

    const order = await this.ordersRepository.findForUnicommercePush(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const payload = mapOrderToUnicommercePayload(order, {
      currency: this.configService.get<string>('unicommerceOrder.currency'),
      slaHours: this.configService.get<number>('unicommerceOrder.slaHours'),
    });

    const skus = payload.orderItems.map((item) => item.sku);
    this.logger.log(
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        itemCount: payload.orderItems.length,
        skus,
        grandTotal: order.grandTotal,
      },
      'Pushing order to UniCommerce',
    );

    const response = await this.apiService.postOrder(payload);

    const succeeded = (response.status ?? '').toLowerCase() === 'success';
    if (succeeded) {
      this.logger.log(
        { orderId: order.id, orderNumber: order.orderNumber, skus, responseStatus: response.status },
        'UniCommerce accepted order',
      );
    } else {
      this.logger.warn(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          skus,
          responseStatus: response.status,
          responseMessage: response.message ?? 'no message',
          responseData: response.data,
        },
        'UniCommerce rejected order',
      );
    }

    return response;
  }
}
