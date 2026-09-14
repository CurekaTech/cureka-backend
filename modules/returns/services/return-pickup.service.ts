import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RETURN_PICKUP_PROVIDER_UNAVAILABLE } from '../constants/return.constants';
import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import {
  IReturnPickupProviderAdapter,
  IReturnPickupScheduleRequest,
  IReturnPickupScheduleResult,
} from '../interfaces/return-pickup-provider.interface';
import { ManualReturnPickupProvider } from './pickup-providers/manual-return-pickup.provider';
import { ShipwayReturnPickupProvider } from './pickup-providers/shipway-return-pickup.provider';
import { UnicommerceReturnPickupProvider } from './pickup-providers/unicommerce-return-pickup.provider';

const asErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Reverse-pickup orchestrator.
 *
 * Forward fulfilment already pushes OMS (Unicommerce) and courier (Shipway)
 * independently. Reverse pickup follows the same split:
 * 1. Unicommerce reversePickup/create so the warehouse expects the item.
 * 2. Shipway POST /api/v2orders so a courier collects it from the customer.
 *
 * MANUAL is the ops fallback when an admin records an AWB booked outside Cureka.
 */
@Injectable()
export class ReturnPickupService {
  private readonly logger = new Logger(ReturnPickupService.name);
  private readonly adapters: Map<ReturnPickupProvider, IReturnPickupProviderAdapter>;

  constructor(
    private readonly configService: ConfigService,
    private readonly manual: ManualReturnPickupProvider,
    private readonly shipway: ShipwayReturnPickupProvider,
    private readonly unicommerce: UnicommerceReturnPickupProvider,
  ) {
    this.adapters = new Map<ReturnPickupProvider, IReturnPickupProviderAdapter>([
      [manual.provider, manual],
      [shipway.provider, shipway],
      [unicommerce.provider, unicommerce],
    ]);
  }

  defaultProvider(): ReturnPickupProvider {
    const configured = this.configService.get<string>('returns.pickup.provider');
    const match = Object.values(ReturnPickupProvider).find((value) => value === configured);
    if (match === ReturnPickupProvider.MANUAL) return ReturnPickupProvider.MANUAL;
    if (this.shipway.isEnabled) return ReturnPickupProvider.SHIPWAY;
    if (this.unicommerce.isEnabled) return ReturnPickupProvider.UNICOMMERCE;
    return match ?? ReturnPickupProvider.MANUAL;
  }

  isEnabled(provider: ReturnPickupProvider): boolean {
    return this.adapters.get(provider)?.isEnabled ?? false;
  }

  /**
   * Book reverse logistics. Unless the admin explicitly chose MANUAL, both
   * Unicommerce and Shipway are notified when they are configured.
   */
  async schedule(
    provider: ReturnPickupProvider,
    request: IReturnPickupScheduleRequest,
  ): Promise<IReturnPickupScheduleResult> {
    if (provider === ReturnPickupProvider.MANUAL) {
      return this.manual.schedule(request);
    }

    const notifyUnicommerce = this.shouldNotifyUnicommerce();
    const notifyShipway = this.shouldNotifyShipway();

    if (!notifyUnicommerce && !notifyShipway) {
      if (request.manual?.reverseAwbNumber) {
        return this.manual.schedule(request);
      }
      throw new BadRequestException({
        code: RETURN_PICKUP_PROVIDER_UNAVAILABLE,
        message:
          'Neither Unicommerce nor Shipway reverse pickup is configured. Record the pickup with the MANUAL provider or set the integration credentials.',
      });
    }

    const errors: string[] = [];
    let unicommerceResult: IReturnPickupScheduleResult | null = null;
    let shipwayResult: IReturnPickupScheduleResult | null = null;
    let shipwayUncertain = false;

    if (notifyUnicommerce) {
      try {
        unicommerceResult = await this.unicommerce.schedule(request);
      } catch (error) {
        const message = asErrorMessage(error);
        errors.push(`Unicommerce: ${message}`);
        this.logger.warn(
          { returnNumber: request.returnNumber, error: message },
          'Unicommerce reverse pickup failed',
        );
      }
    }

    if (notifyShipway) {
      try {
        shipwayResult = await this.shipway.schedule(request);
      } catch (error) {
        const message = asErrorMessage(error);
        errors.push(`Shipway: ${message}`);
        shipwayUncertain = /timed out|abort/i.test(message);
        this.logger.warn(
          { returnNumber: request.returnNumber, error: message, uncertain: shipwayUncertain },
          'Shipway reverse pickup failed',
        );
      }
    }

    if (!unicommerceResult && !shipwayResult) {
      throw new BadRequestException({
        code: RETURN_PICKUP_PROVIDER_UNAVAILABLE,
        message: errors.join(' | ') || 'Reverse pickup providers rejected the request',
      });
    }

    const primary = shipwayResult ?? unicommerceResult!;
    const courierBooked = Boolean(
      shipwayResult &&
        (shipwayResult.reverseAwbNumber || shipwayResult.providerPickupId),
    );
    const unicommerceRecorded = Boolean(unicommerceResult);
    const status = courierBooked
      ? ReturnPickupStatus.SCHEDULED
      : ReturnPickupStatus.FAILED;
    return {
      provider: shipwayResult ? ReturnPickupProvider.SHIPWAY : ReturnPickupProvider.UNICOMMERCE,
      status,
      providerPickupId: primary.providerPickupId,
      reverseAwbNumber: shipwayResult?.reverseAwbNumber ?? null,
      courierName: shipwayResult?.courierName ?? null,
      trackingUrl: shipwayResult?.trackingUrl ?? null,
      scheduledAt: primary.scheduledAt,
      failureReason: errors.length ? errors.join(' | ') : courierBooked ? null : 'Courier pickup was not booked',
      courierBooked,
      unicommerceRecorded,
      uncertainBooking: shipwayUncertain && !shipwayResult,
      unicommerceReversePickupCode: unicommerceResult?.providerPickupId ?? null,
      shipwayOrderId: shipwayResult?.providerPickupId ?? null,
      unicommerceSyncStatus: unicommerceRecorded ? 'CONFIRMED' : errors.some((item) => item.startsWith('Unicommerce:')) ? 'FAILED' : 'NOT_REQUIRED',
      shipwayBookingStatus: courierBooked
        ? 'CONFIRMED'
        : shipwayUncertain
          ? 'UNCERTAIN'
          : notifyShipway
            ? 'FAILED'
            : 'NOT_REQUIRED',
      providerPayload: {
        unicommerce: unicommerceResult?.providerPayload ?? null,
        shipway: shipwayResult?.providerPayload ?? null,
        unicommerceReversePickupCode: unicommerceResult?.providerPickupId ?? null,
        shipwayOrderId: shipwayResult?.providerPickupId ?? null,
        errors: errors.length ? errors : null,
        courierBooked,
        unicommerceRecorded,
      },
    };
  }

  async cancel(
    provider: ReturnPickupProvider,
    params: { returnRequestId: string; reverseAwbNumber: string | null; strict?: boolean },
  ): Promise<void> {
    await this.resolve(provider).cancel(params);
    if (provider !== ReturnPickupProvider.SHIPWAY && this.shipway.isEnabled) {
      await this.shipway.cancel(params);
    }
  }

  private shouldNotifyUnicommerce(): boolean {
    if (this.configService.get<boolean>('returns.pickup.notifyUnicommerce') === false) {
      return false;
    }
    return this.unicommerce.isEnabled;
  }

  private shouldNotifyShipway(): boolean {
    if (this.configService.get<boolean>('returns.pickup.notifyShipway') === false) {
      return false;
    }
    return this.shipway.isEnabled;
  }

  private resolve(provider: ReturnPickupProvider): IReturnPickupProviderAdapter {
    return this.adapters.get(provider) ?? this.adapters.get(ReturnPickupProvider.MANUAL)!;
  }
}
