import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
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
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ status: 'success' })),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await service.postOrder(payload);

    expect(result).toEqual({ status: 'success' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://genericproxy.unicommerce.com/uc/v1/order');
    expect(init.method).toBe('POST');
    expect(init.headers.clientid).toBe('client-1');
    expect(init.headers.merchantid).toBe('merchant-1');
    expect(init.headers.securitykey).toBe('key-1');
  });

  it('throws ServiceUnavailable on non-OK HTTP response', async () => {
    const service = new UnicommerceOrderApiService(buildConfig(baseValues));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ message: 'bad order' })),
    }) as unknown as typeof fetch;

    await expect(service.postOrder(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
