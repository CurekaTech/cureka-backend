import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import * as https from 'https';
import { EventEmitter } from 'events';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';
import { IUnicommerceSaleOrderPayload } from '../interfaces/unicommerce-order.interface';

const saleOrderPayload: IUnicommerceSaleOrderPayload = {
  saleOrder: {
    code: 'ORD-001',
    displayOrderCode: 'ORD-001',
    displayOrderDateTime: new Date().toISOString(),
    channel: 'CUSTOM',
    cashOnDelivery: false,
    addresses: [
      {
        id: 'shipping',
        name: 'Test User',
        addressLine1: '123 Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        phone: '9999999999',
      },
    ],
    billingAddress: { referenceId: 'shipping' },
    shippingAddress: { referenceId: 'shipping' },
    saleOrderItems: [],
  },
};

function buildConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const baseValues: Record<string, unknown> = {
  'unicommerceOrder.tenant': 'stgcureka',
  'unicommerceOrder.username': 'testuser@example.com',
  'unicommerceOrder.password': 'testpassword',
  'unicommerceOrder.facilityCode': 'stgcureka',
  'unicommerceOrder.timeoutMs': 15000,
};

/** Helper to mock https.request for a single response. */
function mockHttpsRequest(statusCode: number, body: unknown) {
  const req = new EventEmitter() as EventEmitter & {
    setTimeout: jest.Mock;
    write: jest.Mock;
    end: jest.Mock;
    destroy: jest.Mock;
  };
  req.setTimeout = jest.fn();
  req.write = jest.fn();
  req.end = jest.fn();
  req.destroy = jest.fn();

  jest.spyOn(https, 'request').mockImplementation(((
    _options: unknown,
    callback?: (res: EventEmitter & { statusCode?: number }) => void,
  ) => {
    const res = new EventEmitter() as EventEmitter & { statusCode?: number };
    res.statusCode = statusCode;
    if (callback) {
      callback(res);
      queueMicrotask(() => {
        res.emit('data', Buffer.from(JSON.stringify(body)));
        res.emit('end');
      });
    }
    return req as unknown as ReturnType<typeof https.request>;
  }) as typeof https.request);

  return req;
}

describe('UnicommerceOrderApiService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports configured when tenant, username, and password are set', () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));
    expect(service.isConfigured()).toBe(true);
  });

  it('reports not configured when tenant is missing', () => {
    const service = new UnicommerceOrderApiService(
      buildConfig({ ...baseValues, 'unicommerceOrder.tenant': '' }),
    );
    expect(service.isConfigured()).toBe(false);
  });

  it('fetches OAuth token then posts createSaleOrder and returns parsed body', async () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));
    const logSpy = jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);

    const tokenResponse = { access_token: 'test-token-abc', token_type: 'bearer', refresh_token: 'ref', expires_in: 3600 };
    const orderResponse = { successful: true, message: 'Sale Order Created' };

    const requestSpy = jest
      .spyOn(https, 'request')
      .mockImplementationOnce(((
        _options: unknown,
        callback?: (res: EventEmitter & { statusCode?: number }) => void,
      ) => {
        const req = Object.assign(new EventEmitter(), {
          setTimeout: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          destroy: jest.fn(),
        });
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        if (callback) {
          callback(res as EventEmitter & { statusCode?: number });
          queueMicrotask(() => {
            res.emit('data', Buffer.from(JSON.stringify(tokenResponse)));
            res.emit('end');
          });
        }
        return req as unknown as ReturnType<typeof https.request>;
      }) as typeof https.request)
      .mockImplementationOnce(((
        _options: unknown,
        callback?: (res: EventEmitter & { statusCode?: number }) => void,
      ) => {
        const req = Object.assign(new EventEmitter(), {
          setTimeout: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          destroy: jest.fn(),
        });
        const res = Object.assign(new EventEmitter(), { statusCode: 200 });
        if (callback) {
          callback(res as EventEmitter & { statusCode?: number });
          queueMicrotask(() => {
            res.emit('data', Buffer.from(JSON.stringify(orderResponse)));
            res.emit('end');
          });
        }
        return req as unknown as ReturnType<typeof https.request>;
      }) as typeof https.request);

    const result = await service.createSaleOrder(saleOrderPayload);

    expect(result).toEqual(orderResponse);
    // First call = OAuth token; second call = createSaleOrder
    expect(requestSpy).toHaveBeenCalledTimes(2);

    const tokenOptions = requestSpy.mock.calls[0][0] as https.RequestOptions;
    expect(tokenOptions.hostname).toBe('stgcureka.unicommerce.com');
    expect(tokenOptions.path).toContain('/oauth/token');
    expect(tokenOptions.method).toBe('GET');

    const orderOptions = requestSpy.mock.calls[1][0] as https.RequestOptions;
    expect(orderOptions.hostname).toBe('stgcureka.unicommerce.com');
    expect(orderOptions.path).toBe('/services/rest/v1/oms/saleOrder/create');
    expect(orderOptions.method).toBe('POST');
    expect((orderOptions.headers as Record<string, string>)['Authorization']).toBe(
      'bearer test-token-abc',
    );

    const tokenAcquiredLog = logSpy.mock.calls.find(
      (call) => call[1] === 'Unicommerce OAuth token acquired',
    );
    expect(tokenAcquiredLog?.[0]).toEqual({
      expiresIn: 3600,
      tokenAcquired: true,
    });
    expect(JSON.stringify(tokenAcquiredLog?.[0])).not.toContain('test-token');
    expect(JSON.stringify(tokenAcquiredLog?.[0])).not.toContain('tokenPrefix');
  });

  it('throws ServiceUnavailable when OAuth token request fails', async () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));
    mockHttpsRequest(401, { error: 'unauthorized' });

    await expect(service.createSaleOrder(saleOrderPayload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
