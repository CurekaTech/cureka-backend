import { plainToInstance } from 'class-transformer';
import { ShipwayWebhookController } from './shipway-webhook.controller';
import { ShipwayWebhookDto } from '../dto/shipway-webhook.dto';
import { ShipwayService } from '../services/shipway.service';
import { ShippingService } from '../services/shipping.service';

describe('ShipwayWebhookController.normalizeEvents', () => {
  const controller = new ShipwayWebhookController(
    {} as ShipwayService,
    {} as ShippingService,
  );

  it('maps the Shipway panel sample into one internal event', () => {
    const payload = {
      store_code: '1',
      awbno: '12345678901234',
      carrier: 'DummyCarrier',
      scans_current_status: 'Delivered to consignee',
      scans_current_status_time: '2025-01-04 15:00:00',
      api_input: {
        awbno: '12345678901234',
        carrier: 'DummyCarrier',
        carrier_id: '99',
        current_status: 'DEL',
        current_status_desc: 'Delivered',
        status_time: '2025-01-04 15:00:00',
        order_id: '99999999',
        tracking_url: 'https://dummytracking.com/track/12345678901234',
        scans: {
          '0': {
            location: 'Dummy_Location_A',
            time: '2025-01-04 15:00:00',
            status: 'Delivered to consignee',
          },
          '2': {
            location: 'Dummy_Location_B',
            time: '2025-01-04 12:00:00',
            status: 'Out for delivery',
          },
        },
      },
      current_status: 'DEL',
      status_time: '2025-01-04 15:00:00',
      order_id: '99999999',
    } as ShipwayWebhookDto;

    const events = controller.normalizeEvents(payload);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      order_id: '99999999',
      status: 'DEL',
      awb_number: '12345678901234',
      courier_name: 'DummyCarrier',
      courier_id: '99',
      status_date: '2025-01-04 15:00:00',
      tracking_url: 'https://dummytracking.com/track/12345678901234',
      message: 'Delivered to consignee',
    });
    expect(events[0].scans).toEqual([
      {
        status: 'Delivered to consignee',
        location: 'Dummy_Location_A',
        status_date: '2025-01-04 15:00:00',
        message: undefined,
      },
      {
        status: 'Out for delivery',
        location: 'Dummy_Location_B',
        status_date: '2025-01-04 12:00:00',
        message: undefined,
      },
    ]);
  });

  it('maps INT / OOD / SCH single-event bodies', () => {
    expect(
      controller.normalizeEvents({ order_id: 'CUR1', current_status: 'INT' } as ShipwayWebhookDto),
    ).toEqual([
      expect.objectContaining({ order_id: 'CUR1', status: 'INT', current_status_code: 'INT' }),
    ]);
    expect(
      controller.normalizeEvents({ order_id: 'CUR1', current_status: 'OOD' } as ShipwayWebhookDto),
    ).toEqual([
      expect.objectContaining({ order_id: 'CUR1', status: 'OOD' }),
    ]);
    expect(
      controller.normalizeEvents({ order_id: 'CUR1', current_status: 'SCH' } as ShipwayWebhookDto),
    ).toEqual([
      expect.objectContaining({ order_id: 'CUR1', status: 'SCH' }),
    ]);
  });
});

describe('ShipwayWebhookController.webhook with reverse_tracking_number', () => {
  it('reaches handleShipwayWebhookBatch after numeric reverse_tracking_number transform', async () => {
    const shipwayService = {
      verifyWebhookAuth: jest.fn().mockReturnValue('unsigned'),
    };
    const shippingService = {
      handleShipwayWebhookBatch: jest.fn().mockResolvedValue({
        processed: 1,
        skipped: 0,
        notFound: 0,
        unresolved: 0,
        reconciled: 0,
        failed: 0,
        results: [{ outcome: 'processed' }],
      }),
    };
    const controller = new ShipwayWebhookController(
      shipwayService as unknown as ShipwayService,
      shippingService as unknown as ShippingService,
    );

    const dto = plainToInstance(ShipwayWebhookDto, {
      order_id: 'ORD015487605062',
      current_status: 'DEL',
      awbno: '11633336773305',
      reverse_tracking_number: 11633336773305,
    });
    expect(dto.reverse_tracking_number).toBe('11633336773305');

    const response = await controller.webhook(
      { id: 'a9b3e385-322a-4240-8998-e629e7c89a34', headers: {} } as never,
      dto,
    );

    expect(shipwayService.verifyWebhookAuth).toHaveBeenCalled();
    expect(shippingService.handleShipwayWebhookBatch).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          order_id: 'ORD015487605062',
          status: 'DEL',
          awb_number: '11633336773305',
        }),
      ],
      'unsigned',
    );
    expect(response).toMatchObject({
      received: true,
      processed: 1,
      authMode: 'unsigned',
    });
  });
});
