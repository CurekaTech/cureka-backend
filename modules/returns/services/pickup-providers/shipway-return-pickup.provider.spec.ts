import { ConfigService } from '@nestjs/config';
import { ShipwayService } from '@modules/shipping/services/shipway.service';
import { ReturnResolution } from '../../enums/return-resolution.enum';
import { ShipwayReturnPickupProvider } from './shipway-return-pickup.provider';

describe('ShipwayReturnPickupProvider', () => {
  const shipwayService = {
    isConfigured: jest.fn().mockReturnValue(true),
    pushOrder: jest.fn(),
    cancelShipment: jest.fn(),
  };
  const configService = {
    get: jest.fn().mockReturnValue(undefined),
  };
  const provider = new ShipwayReturnPickupProvider(
    shipwayService as unknown as ShipwayService,
    configService as unknown as ConfigService,
  );

  const request = {
    returnRequestId: 'ret-1',
    returnNumber: 'RTN1',
    orderNumber: 'ORD1',
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

  beforeEach(() => {
    jest.clearAllMocks();
    shipwayService.isConfigured.mockReturnValue(true);
  });

  it('reuses an existing Shipway reverse order instead of booking a second pickup', async () => {
    const result = await provider.schedule({
      ...request,
      existing: { shipwayOrderId: 'RTN1', reverseAwbNumber: 'AWB-EXISTING' },
    });

    expect(shipwayService.pushOrder).not.toHaveBeenCalled();
    expect(result.providerPayload).toMatchObject({ reused: true });
    expect(result.reverseAwbNumber).toBe('AWB-EXISTING');
  });

  it('books with the Cureka return number as the Shipway order id', async () => {
    shipwayService.pushOrder.mockResolvedValue({
      success: true,
      awb_number: 'AWB-NEW',
      courier_name: 'Delhivery',
    });

    const result = await provider.schedule(request);

    expect(shipwayService.pushOrder).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 'RTN1' }),
    );
    expect(result.reverseAwbNumber).toBe('AWB-NEW');
  });
});
