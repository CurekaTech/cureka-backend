import { Injectable } from '@nestjs/common';
import { ReturnPickupProvider } from '../../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../../enums/return-pickup-status.enum';
import {
  IReturnPickupProviderAdapter,
  IReturnPickupScheduleRequest,
  IReturnPickupScheduleResult,
} from '../../interfaces/return-pickup-provider.interface';

/**
 * Records a reverse pickup arranged outside Cureka.
 *
 * Used when Unicommerce/Shipway are unavailable or operations booked the
 * courier in the provider panel and only need to store the AWB here.
 */
@Injectable()
export class ManualReturnPickupProvider implements IReturnPickupProviderAdapter {
  readonly provider = ReturnPickupProvider.MANUAL;
  readonly isEnabled = true;

  schedule(request: IReturnPickupScheduleRequest): Promise<IReturnPickupScheduleResult> {
    return Promise.resolve({
      provider: this.provider,
      status: ReturnPickupStatus.SCHEDULED,
      providerPickupId: null,
      reverseAwbNumber: request.manual?.reverseAwbNumber?.trim() || null,
      courierName: request.manual?.courierName?.trim() || null,
      trackingUrl: request.manual?.trackingUrl?.trim() || null,
      scheduledAt: request.scheduledAt,
      providerPayload: null,
    });
  }

  cancel(): Promise<void> {
    return Promise.resolve();
  }
}
