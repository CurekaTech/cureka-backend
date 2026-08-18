import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { ShipwayService } from './shipway.service';
import { ShipwayWebhookDto } from '../dto/shipway-webhook.dto';

describe('ShipwayService webhook auth', () => {
  const email = 'shipway-user';
  const licenseKey = 'licence-key-123';
  const webhookSecret = 'webhook-secret';

  const buildService = (overrides?: Record<string, string | undefined>) => {
    const values: Record<string, string | undefined> = {
      'shipway.email': email,
      'shipway.licenseKey': licenseKey,
      'shipway.baseUrl': 'https://app.shipway.com',
      'shipway.trackingBaseUrl': 'https://shipway.in',
      'shipway.timeoutMs': '15000' as unknown as string,
      'shipway.webhookSecret': webhookSecret,
      ...overrides,
    };
    const config = {
      get: <T>(key: string): T => values[key] as T,
    } as ConfigService;
    return new ShipwayService(config);
  };

  const previousNodeEnv = process.env['NODE_ENV'];

  afterEach(() => {
    process.env['NODE_ENV'] = previousNodeEnv;
  });

  it('accepts a valid classic status_feed hash', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService();
    const hash = createHash('md5').update(`${email}:${licenseKey}`).digest('hex');
    const payload = {
      hash,
      status_feed: [{ order_id: 'ORD1', current_status: 'OOD' }],
    } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, JSON.stringify(payload))).not.toThrow();
  });

  it('rejects an invalid classic status_feed hash', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService();
    const payload = {
      hash: 'deadbeef',
      status_feed: [{ order_id: 'ORD1', current_status: 'OOD' }],
    } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, JSON.stringify(payload))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed in production when HMAC secret is missing for single-event webhooks', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService({ 'shipway.webhookSecret': '' });
    const payload = { order_id: 'ORD1', status: 'INT' } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, '{"order_id":"ORD1","status":"INT"}')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('accepts a valid HMAC signature for single-event webhooks', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService();
    const rawBody = '{"order_id":"ORD1","status":"INT"}';
    const signature = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const payload = { order_id: 'ORD1', status: 'INT' } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, rawBody, signature)).not.toThrow();
  });

  it('rejects a missing HMAC signature when secret is configured', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService();
    const payload = { order_id: 'ORD1', status: 'INT' } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, '{"order_id":"ORD1","status":"INT"}')).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts an empty status_feed sample ping without HMAC', () => {
    process.env['NODE_ENV'] = 'production';
    const service = buildService();
    const payload = { hash: undefined, status_feed: [] } as ShipwayWebhookDto;

    expect(() => service.verifyWebhookAuth(payload, JSON.stringify(payload))).not.toThrow();
  });
});
