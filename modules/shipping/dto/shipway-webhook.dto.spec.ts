import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShipwayWebhookDto } from './shipway-webhook.dto';

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
