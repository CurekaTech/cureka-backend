import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { IReturnPickupProviderAdapter, IReturnPickupScheduleRequest } from '../interfaces/return-pickup-provider.interface';
import { ManualReturnPickupProvider } from './pickup-providers/manual-return-pickup.provider';
import { ReturnPickupService } from './return-pickup.service';

const request: IReturnPickupScheduleRequest = {
  returnRequestId: 'ret-1',
  returnNumber: 'RET0000001',
  orderNumber: 'CUR1',
  reason: 'Damaged',
  resolution: ReturnResolution.REFUND,
  pickupAddress: {
    recipientName: 'Ada Lovelace',
    phoneNumber: '9876543210',
    addressLine1: '1 Street',
    addressLine2: null,
    landmark: null,
    city: 'Chennai',
    state: 'TN',
    pincode: '600001',
  },
  items: [{ sku: 'SKU-A', quantity: 1, productName: 'Serum' }],
  originalOrderItems: [{ sku: 'SKU-A', quantity: 1 }],
  scheduledAt: null,
};

describe('ReturnPickupService', () => {
  const config = (values: Record<string, unknown> = {}) =>
    ({ get: jest.fn((key: string) => values[key]) }) as unknown as ConfigService;

  const manual = new ManualReturnPickupProvider();

  const mockAdapter = (
    provider: ReturnPickupProvider,
    enabled: boolean,
    scheduleImpl?: () => Promise<unknown>,
  ): IReturnPickupProviderAdapter =>
    ({
      provider,
      isEnabled: enabled,
      schedule: jest.fn(
        scheduleImpl ??
          (async () => ({
            provider,
            status: ReturnPickupStatus.SCHEDULED,
            providerPickupId: `${provider}-id`,
            reverseAwbNumber: provider === ReturnPickupProvider.SHIPWAY ? 'AWB1' : null,
            courierName: provider === ReturnPickupProvider.SHIPWAY ? 'Delhivery' : null,
            trackingUrl: null,
            scheduledAt: new Date(),
            providerPayload: { provider },
          })),
      ),
      cancel: jest.fn(),
    }) as unknown as IReturnPickupProviderAdapter;

  const createService = (
    shipway: IReturnPickupProviderAdapter,
    unicommerce: IReturnPickupProviderAdapter,
    values: Record<string, unknown> = {},
  ) =>
    new ReturnPickupService(
      config(values),
      manual,
      shipway as never,
      unicommerce as never,
    );

  it('notifies Unicommerce and Shipway on a non-manual schedule', async () => {
    const shipway = mockAdapter(ReturnPickupProvider.SHIPWAY, true);
    const unicommerce = mockAdapter(ReturnPickupProvider.UNICOMMERCE, true);
    const service = createService(shipway, unicommerce, {
      'returns.pickup.notifyUnicommerce': true,
      'returns.pickup.notifyShipway': true,
    });

    const result = await service.schedule(ReturnPickupProvider.SHIPWAY, request);

    expect(unicommerce.schedule).toHaveBeenCalledTimes(1);
    expect(shipway.schedule).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe(ReturnPickupProvider.SHIPWAY);
    expect(result.reverseAwbNumber).toBe('AWB1');
    expect(result.providerPayload).toMatchObject({
      unicommerceReversePickupCode: 'UNICOMMERCE-id',
      shipwayOrderId: 'SHIPWAY-id',
    });
  });

  it('succeeds when Unicommerce fails but Shipway succeeds', async () => {
    const shipway = mockAdapter(ReturnPickupProvider.SHIPWAY, true);
    const unicommerce = mockAdapter(ReturnPickupProvider.UNICOMMERCE, true, async () => {
      throw new Error('Uniware timeout');
    });
    const service = createService(shipway, unicommerce);

    const result = await service.schedule(ReturnPickupProvider.SHIPWAY, request);

    expect(result.provider).toBe(ReturnPickupProvider.SHIPWAY);
    expect(result.failureReason).toContain('Unicommerce');
  });

  it('does not call logistics providers for an explicit MANUAL schedule', async () => {
    const shipway = mockAdapter(ReturnPickupProvider.SHIPWAY, true);
    const unicommerce = mockAdapter(ReturnPickupProvider.UNICOMMERCE, true);
    const service = createService(shipway, unicommerce);

    const result = await service.schedule(ReturnPickupProvider.MANUAL, {
      ...request,
      manual: { reverseAwbNumber: 'HAND-1', courierName: 'DTDC', trackingUrl: null },
    });

    expect(shipway.schedule).not.toHaveBeenCalled();
    expect(unicommerce.schedule).not.toHaveBeenCalled();
    expect(result.reverseAwbNumber).toBe('HAND-1');
  });

  it('throws when neither provider is configured', async () => {
    const shipway = mockAdapter(ReturnPickupProvider.SHIPWAY, false);
    const unicommerce = mockAdapter(ReturnPickupProvider.UNICOMMERCE, false);
    const service = createService(shipway, unicommerce);

    await expect(service.schedule(ReturnPickupProvider.SHIPWAY, request)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
