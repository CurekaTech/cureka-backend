import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { IReturnPickupAddress } from './return-pickup-address.interface';

export interface IReturnPickupScheduleRequest {
  returnRequestId: string;
  returnNumber: string;
  orderNumber: string;
  reason: string;
  resolution: ReturnResolution;
  pickupAddress: IReturnPickupAddress | null;
  customerEmail?: string | null;
  items: Array<{
    sku: string;
    quantity: number;
    productName: string;
    unitPrice?: string;
    replacementSku?: string | null;
  }>;
  /** Original order lines, used to reconstruct Uniware item codes if get-sale-order fails. */
  originalOrderItems: Array<{ sku: string; quantity: number }>;
  scheduledAt: Date | null;
  /** Values an admin recorded by hand, used as-is by the manual provider. */
  manual?: {
    reverseAwbNumber?: string | null;
    courierName?: string | null;
    trackingUrl?: string | null;
  };
  existing?: {
    unicommerceReversePickupCode?: string | null;
    shipwayOrderId?: string | null;
    reverseAwbNumber?: string | null;
  };
}

export interface IReturnPickupScheduleResult {
  provider: ReturnPickupProvider;
  status: ReturnPickupStatus;
  providerPickupId: string | null;
  reverseAwbNumber: string | null;
  courierName: string | null;
  trackingUrl: string | null;
  scheduledAt: Date | null;
  /** Raw provider response retained for support; never contains credentials. */
  providerPayload: Record<string, unknown> | null;
  failureReason?: string | null;
  courierBooked?: boolean;
  unicommerceRecorded?: boolean;
  uncertainBooking?: boolean;
  unicommerceReversePickupCode?: string | null;
  shipwayOrderId?: string | null;
  unicommerceSyncStatus?: string | null;
  shipwayBookingStatus?: string | null;
}

/**
 * Provider-independent reverse-pickup port.
 *
 * On approval Cureka notifies Unicommerce (WMS reverse pickup) and Shipway
 * (courier reverse booking) independently — the same split used for forward
 * fulfilment. MANUAL remains the ops fallback.
 */
export interface IReturnPickupProviderAdapter {
  readonly provider: ReturnPickupProvider;
  readonly isEnabled: boolean;
  schedule(request: IReturnPickupScheduleRequest): Promise<IReturnPickupScheduleResult>;
  cancel(params: { returnRequestId: string; reverseAwbNumber: string | null; strict?: boolean }): Promise<void>;
}
