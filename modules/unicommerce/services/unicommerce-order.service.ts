import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersRepository } from '@modules/orders/repositories/orders.repository';
import { mapOrderToUnicommercePayload } from '../mappers/unicommerce-order.mapper';
import { IUnicommercePostOrderResponse } from '../interfaces/unicommerce-order.interface';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';

@Injectable()
export class UnicommerceOrderService {
  private readonly logger = new Logger(UnicommerceOrderService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersRepository: OrdersRepository,
    private readonly apiService: UnicommerceOrderApiService,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.configService.get<boolean>('unicommerceOrder.enabled'));
  }

  async pushOrder(orderId: string): Promise<IUnicommercePostOrderResponse | null> {
    if (!this.isEnabled()) {
      this.logger.log(`UniCommerce order push disabled; skipping order ${orderId}`);
      return null;
    }

    const order = await this.ordersRepository.findForUnicommercePush(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    const payload = mapOrderToUnicommercePayload(order, {
      facilityCode: this.configService.get<string>('unicommerceOrder.facilityCode'),
      currency: this.configService.get<string>('unicommerceOrder.currency'),
      slaHours: this.configService.get<number>('unicommerceOrder.slaHours'),
    });

    this.logger.log(
      { orderId: order.id, orderNumber: order.orderNumber },
      'Pushing order to UniCommerce',
    );

    const response = await this.apiService.postOrder(payload);

    const succeeded = (response.status ?? '').toLowerCase() === 'success';
    if (!succeeded) {
      this.logger.warn(
        `UniCommerce rejected order ${order.orderNumber}: ${response.message ?? 'no message'}`,
      );
    }

    return response;
  }
}
