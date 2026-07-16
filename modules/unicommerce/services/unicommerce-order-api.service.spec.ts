import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import * as https from 'https';
import { EventEmitter } from 'events';
import { UnicommerceOrderApiService } from './unicommerce-order-api.service';
import { IUnicommercePostOrderPayload } from '../interfaces/unicommerce-order.interface';

const payload = { id: 'ORD1', orderItems: [] } as unknown as IUnicommercePostOrderPayload;

function buildConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('UnicommerceOrderApiService', () => {
  const baseValues: Record<string, unknown> = {
    'unicommerceOrder.baseUrl': 'https://genericproxy.unicommerce.com',
    'unicommerceOrder.endpoint': '/uc/v1/order',
    'unicommerceOrder.clientId': 'client-1',
    'unicommerceOrder.merchantId': 'merchant-1',
    'unicommerceOrder.securityKey': 'key-1',
    'unicommerceOrder.timeoutMs': 15000,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports configured when all headers present', () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));
    expect(service.isConfigured()).toBe(true);
  });

  it('reports not configured when a header is missing', () => {
    const service = new UnicommerceOrderApiService(
      buildConfig({ ...baseValues, 'unicommerceOrder.securityKey': '' }),
    );
    expect(service.isConfigured()).toBe(false);
  });

  it('throws when credentials are missing', async () => {
    const service = new UnicommerceOrderApiService(
      buildConfig({ ...baseValues, 'unicommerceOrder.clientId': '' }),
    );
    await expect(service.postOrder(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('posts with UniCommerce auth headers and returns parsed body', async () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));

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

    const requestSpy = jest.spyOn(https, 'request').mockImplementation(((
      _options: unknown,
      callback?: (res: EventEmitter & { statusCode?: number }) => void,
    ) => {
      const res = new EventEmitter() as EventEmitter & { statusCode?: number };
      res.statusCode = 200;
      if (callback) {
        callback(res);
        queueMicrotask(() => {
          res.emit('data', Buffer.from(JSON.stringify({ status: 'success' })));
          res.emit('end');
        });
      }
      return req as unknown as ReturnType<typeof https.request>;
    }) as typeof https.request);

    const result = await service.postOrder(payload);

    expect(result).toEqual({ status: 'success' });
    expect(requestSpy).toHaveBeenCalled();
    const options = requestSpy.mock.calls[0][0] as https.RequestOptions;
    expect(options.method).toBe('POST');
    expect(options.hostname).toBe('genericproxy.unicommerce.com');
    expect(options.path).toBe('/uc/v1/order');
    expect(options.headers).toMatchObject({
      ClientId: 'client-1',
      merchantId: 'merchant-1',
      securitykey: 'key-1',
    });
    expect(req.write).toHaveBeenCalled();
    expect(req.end).toHaveBeenCalled();
  });

  it('throws ServiceUnavailable on non-OK HTTP response', async () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));

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
      res.statusCode = 400;
      if (callback) {
        callback(res);
        queueMicrotask(() => {
          res.emit('data', Buffer.from(JSON.stringify({ message: 'bad order' })));
          res.emit('end');
        });
      }
      return req as unknown as ReturnType<typeof https.request>;
    }) as typeof https.request);

    await expect(service.postOrder(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
