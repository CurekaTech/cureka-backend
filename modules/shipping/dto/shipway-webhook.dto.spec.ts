import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShipwayWebhookDto } from './shipway-webhook.dto';

/** Exact Shipway panel / carrier webhook sample shape (minus PII-heavy fields). */
const SHIPWAY_PANEL_SAMPLE = {
  store_code: '1',
  awbno: '12345678901234',
  company_id: '99999',
  pod: 'dummy_pod',
  pickupdate: '2025-01-01 10:00:00',
  expected_delivery_date: '2025-01-05',
  scans_current_status_time: '2025-01-04 15:00:00',
  scans_current_status: 'Delivered to consignee',
  epod: 'dummy_epod',
  carrier: 'DummyCarrier',
  api_input: {
    awbno: '12345678901234',
    company_id: '99999',
    pickupdate: '2025-01-01 10:00:00',
    last_name: 'Doe',
    webhook_sent_date: '2025-01-04 15:30:00',
    carrier_id: '99',
    callback_url: 'https://dummywebhook.com/callback',
    country_code: 'IN',
    carrier: 'DummyCarrier',
    received_by: 'John Doe',
    current_status_desc: 'Delivered',
    scans: {
      '0': {
        location: 'Dummy_Location_A',
        time: '2025-01-04 15:00:00',
        status: 'Delivered to consignee',
      },
      '1': {
        location: 'Dummy_Location_A',
        time: '2025-01-04 14:00:00',
        status: 'Call placed to consignee',
      },
      '2': {
        location: 'Dummy_Location_B',
        time: '2025-01-04 12:00:00',
        status: 'Out for delivery',
      },
    },
    phone: '9999999999',
    order_data: 'dummy@domain.com',
    current_status: 'DEL',
    from: 'Dummy_Location_A',
    extra_fields: {
      dispatchCount: '1',
      StatusType: 'DL',
      expected_delivery_date: '2025-01-05 23:59:59',
      ReferenceNo: '999999',
    },
    to: 'Dummy_Location_B',
    status_time: '2025-01-04 15:00:00',
    order_id: '99999999',
    first_name: 'John',
    tracking_url: 'https://dummytracking.com/track/12345678901234',
    email: 'dummy@domain.com',
  },
  current_status: 'DEL',
  status_time: '2025-01-04 15:00:00',
  order_id: '99999999',
  reverse_tracking_number: '99999999999999',
};

describe('ShipwayWebhookDto', () => {
  const validateBody = (body: Record<string, unknown>) =>
    validate(plainToInstance(ShipwayWebhookDto, body));

  it('accepts the documented Shipway status_feed payload', async () => {
    const errors = await validateBody({
      hash: 'd60cdf34ebacf6cbf4e6080061c1ba1f',
      status_feed: [
        { order_id: '001', current_status: 'OOD' },
        { order_id: '002', current_status: 'RTO', awb: '123', extra_field: 'ok' },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts an empty status_feed sample ping', async () => {
    const errors = await validateBody({
      hash: 'd60cdf34ebacf6cbf4e6080061c1ba1f',
      status_feed: [],
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts current_status on a single-event body', async () => {
    const errors = await validateBody({
      order_id: 'CUR1',
      current_status: 'INT',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts the Shipway panel sample webhook format', async () => {
    const errors = await validateBody(SHIPWAY_PANEL_SAMPLE);
    expect(errors).toHaveLength(0);
  });

  it('keeps awbno, carrier, status_time, and api_input.scans after transform', () => {
    const dto = plainToInstance(ShipwayWebhookDto, SHIPWAY_PANEL_SAMPLE);
    expect(dto.awbno).toBe('12345678901234');
    expect(dto.carrier).toBe('DummyCarrier');
    expect(dto.status_time).toBe('2025-01-04 15:00:00');
    expect(dto.api_input?.scans).toBeDefined();
    expect(dto.api_input?.tracking_url).toContain('dummytracking.com');
  });

  it('rejects an empty object', async () => {
    const errors = await validateBody({});
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((error) => error.property === 'order_id')).toBe(true);
  });

  it('rejects a status_feed item without order_id or status', async () => {
    const errors = await validateBody({
      status_feed: [{ current_status: 'OOD' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
