import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
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

/**
 * Failed production request only logged the class-validator pair
 * (must be a string + MaxLength). That pair is produced for non-strings;
 * numeric JSON is the usual Shipway tracking-id encoding.
 */
const FAILED_REVERSE_TRACKING_NUMERIC_SHAPE = {
  order_id: 'ORD015487605062',
  current_status: 'DEL',
  awbno: '11633336773305',
  reverse_tracking_number: 11633336773305,
};

const shipwayValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });

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

  describe('reverse_tracking_number normalization', () => {
    it('accepts missing reverse_tracking_number', async () => {
      const errors = await validateBody({
        order_id: 'CUR1',
        current_status: 'OOD',
      });
      expect(errors).toHaveLength(0);
    });

    it('accepts null and empty reverse_tracking_number as omitted', async () => {
      for (const reverse_tracking_number of [null, '', '  ']) {
        const dto = plainToInstance(ShipwayWebhookDto, {
          order_id: 'CUR1',
          current_status: 'OOD',
          reverse_tracking_number,
        });
        expect(dto.reverse_tracking_number).toBeUndefined();
        expect(await validate(dto)).toHaveLength(0);
      }
    });

    it('accepts string reverse_tracking_number and preserves leading zeros', async () => {
      const dto = plainToInstance(ShipwayWebhookDto, {
        order_id: 'CUR1',
        current_status: 'OOD',
        reverse_tracking_number: '0011663336773305',
      });
      expect(dto.reverse_tracking_number).toBe('0011663336773305');
      expect(await validate(dto)).toHaveLength(0);
    });

    it('accepts numeric reverse_tracking_number (failed production shape) as string', async () => {
      const dto = plainToInstance(ShipwayWebhookDto, FAILED_REVERSE_TRACKING_NUMERIC_SHAPE);
      expect(dto.reverse_tracking_number).toBe('11633336773305');
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejects oversized reverse_tracking_number strings', async () => {
      const errors = await validateBody({
        order_id: 'CUR1',
        current_status: 'OOD',
        reverse_tracking_number: 'x'.repeat(101),
      });
      expect(errors.some((error) => error.property === 'reverse_tracking_number')).toBe(true);
    });

    it('rejects unsupported reverse_tracking_number shapes without coercion', async () => {
      for (const reverse_tracking_number of [true, ['116'], { n: 1 }, 12.5]) {
        const errors = await validateBody({
          order_id: 'CUR1',
          current_status: 'OOD',
          reverse_tracking_number,
        });
        expect(errors.some((error) => error.property === 'reverse_tracking_number')).toBe(true);
      }
    });

    it('rejects unsafe integers rather than corrupting digits', async () => {
      const unsafe = Number.MAX_SAFE_INTEGER + 2;
      const dto = plainToInstance(ShipwayWebhookDto, {
        order_id: 'CUR1',
        current_status: 'OOD',
        reverse_tracking_number: unsafe,
      });
      expect(typeof dto.reverse_tracking_number).toBe('number');
      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'reverse_tracking_number')).toBe(true);
    });

    it('passes Nest ValidationPipe for numeric reverse_tracking_number', async () => {
      const pipe = shipwayValidationPipe();
      const result = (await pipe.transform(FAILED_REVERSE_TRACKING_NUMERIC_SHAPE, {
        type: 'body',
        metatype: ShipwayWebhookDto,
      })) as ShipwayWebhookDto;

      expect(result).toBeInstanceOf(ShipwayWebhookDto);
      expect(result.reverse_tracking_number).toBe('11633336773305');
      expect(result.order_id).toBe('ORD015487605062');
      expect(result.current_status).toBe('DEL');
    });

    it('still rejects empty bodies through ValidationPipe', async () => {
      const pipe = shipwayValidationPipe();
      await expect(
        pipe.transform({}, { type: 'body', metatype: ShipwayWebhookDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
