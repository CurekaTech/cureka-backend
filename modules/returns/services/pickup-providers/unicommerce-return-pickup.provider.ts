import { Injectable, Logger } from '@nestjs/common';
import { UnicommerceOrderService } from '@modules/unicommerce/services/unicommerce-order.service';
import { RETURN_PICKUP_PROVIDER_UNAVAILABLE } from '../../constants/return.constants';
import { ReturnPickupProvider } from '../../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../../enums/return-pickup-status.enum';
import { ReturnResolution } from '../../enums/return-resolution.enum';
import {
  IReturnPickupProviderAdapter,
  IReturnPickupScheduleRequest,
  IReturnPickupScheduleResult,
} from '../../interfaces/return-pickup-provider.interface';

/**
 * Creates a Uniware reverse pickup via the official
 * POST /services/rest/v1/oms/reversePickup/create contract.
 *
 * This registers the RMA in the warehouse. Courier collection is booked
 * separately through Shipway, matching how Cureka already splits OMS vs courier
 * on forward orders.
 */
@Injectable()
export class UnicommerceReturnPickupProvider implements IReturnPickupProviderAdapter {
  private readonly logger = new Logger(UnicommerceReturnPickupProvider.name);
  readonly provider = ReturnPickupProvider.UNICOMMERCE;

  constructor(private readonly unicommerceOrderService: UnicommerceOrderService) {}

  get isEnabled(): boolean {
    return this.unicommerceOrderService.isEnabled() && this.unicommerceOrderService.isConfigured();
  }

  async schedule(request: IReturnPickupScheduleRequest): Promise<IReturnPickupScheduleResult> {
    if (!this.isEnabled) {
      throw new Error(RETURN_PICKUP_PROVIDER_UNAVAILABLE);
    }

    if (request.existing?.unicommerceReversePickupCode) {
      return {
        provider: this.provider,
        status: ReturnPickupStatus.SCHEDULED,
        providerPickupId: request.existing.unicommerceReversePickupCode,
        reverseAwbNumber: null,
        courierName: null,
        trackingUrl: null,
        scheduledAt: request.scheduledAt ?? new Date(),
        providerPayload: {
          reused: true,
          reversePickupCode: request.existing.unicommerceReversePickupCode,
        },
      };
    }

    const replacementSku =
      request.resolution === ReturnResolution.REPLACEMENT
        ? request.items.find((item) => item.replacementSku)?.replacementSku ??
          request.items[0]?.sku ??
          null
        : null;

    const response = await this.unicommerceOrderService.createReversePickup({
      orderNumber: request.orderNumber,
      reversePickupCode: request.returnNumber,
      reason: request.reason,
      items: request.items.map((item) => ({ sku: item.sku, quantity: item.quantity })),
      originalOrderItems: request.originalOrderItems,
      pickupAddress: request.pickupAddress,
      customerEmail: request.customerEmail,
      replacementSku,
    });

    if (!response.successful) {
      const detail =
        response.errors?.map((error) => error.description ?? error.message).filter(Boolean).join('; ') ||
        response.message ||
        'Unicommerce rejected reverse pickup';
      this.logger.warn(
        { returnNumber: request.returnNumber, orderNumber: request.orderNumber, detail },
        'Unicommerce reverse pickup rejected',
      );
      throw new Error(detail);
    }

    const reversePickupCode =
      response.reversePickupCode ??
      response.reversePickupDTO?.reversePickupCode ??
      response.reversePickupDTO?.code ??
      request.returnNumber;

    return {
      provider: this.provider,
      status: ReturnPickupStatus.SCHEDULED,
      providerPickupId: reversePickupCode,
      reverseAwbNumber: null,
      courierName: null,
      trackingUrl: null,
      scheduledAt: request.scheduledAt ?? new Date(),
      providerPayload: {
        successful: response.successful,
        message: response.message ?? null,
        reversePickupCode,
        errors: response.errors ?? null,
      },
    };
  }

  cancel(): Promise<void> {
    this.logger.warn(
      {
        blocker:
          'Unicommerce reversePickup cancel API is not implemented in this connector. ' +
          'Official create is POST /services/rest/v1/oms/reversePickup/create. ' +
          'A documented reverse-pickup cancel contract was not present in the Cureka integration, so Uniware RMA remains until ops cancel it in Uniware.',
      },
      'Unicommerce reverse pickup cancel is unsupported — no-op',
    );
    return Promise.resolve();
  }
}
