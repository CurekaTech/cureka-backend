import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EVENTS, OrderConfirmedEvent } from '@packages/events';
import { ProductSubscriptionsService } from '../services/product-subscriptions.service';
import { UserAddressesRepository } from '@modules/users/repositories/user-addresses.repository';

@Injectable()
export class OrderConfirmedSubscriptionListener {
  private readonly logger = new Logger(OrderConfirmedSubscriptionListener.name);

  constructor(
    private readonly subscriptionsService: ProductSubscriptionsService,
    private readonly addressesRepository: UserAddressesRepository,
  ) {}

  @OnEvent(EVENTS.ORDER_CONFIRMED, { async: true })
  async handleOrderConfirmed(event: OrderConfirmedEvent): Promise<void> {
    if (event.subscriptionItems.length === 0) return;

    let addressId = event.addressId;
    if (!addressId) {
      const addresses = await this.addressesRepository.findAllByUserId(event.userId);
      const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
      addressId = defaultAddress?.id ?? null;
    }

    if (!addressId) {
      this.logger.warn(
        { orderId: event.orderId, userId: event.userId },
        '[OrderConfirmedSubscription] No address found — skipping subscription creation',
      );
      return;
    }

    for (const item of event.subscriptionItems) {
      try {
        await this.subscriptionsService.activateFromPaidOrder(event.userId, {
          orderRef: event.orderNumber,
          productId: item.productId,
          productVariantId: item.variantId,
          frequency: item.frequency,
          quantity: item.quantity,
          addressId,
        });
        this.logger.log(
          {
            orderId: event.orderId,
            productId: item.productId,
            variantId: item.variantId,
            frequency: item.frequency,
          },
          '[OrderConfirmedSubscription] Subscription activated successfully',
        );
      } catch (error) {
        this.logger.error(
          {
            orderId: event.orderId,
            productId: item.productId,
            variantId: item.variantId,
            error: error instanceof Error ? error.message : String(error),
          },
          '[OrderConfirmedSubscription] Failed to activate subscription (non-blocking)',
        );
      }
    }
  }
}
