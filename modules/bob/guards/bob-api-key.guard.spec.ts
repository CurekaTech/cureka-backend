import { ExecutionContext, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BobApiKeyGuard } from './bob-api-key.guard';

describe('BobApiKeyGuard', () => {
  const configService = {
    get: jest.fn(),
  };

  const guard = new BobApiKeyGuard(configService as unknown as ConfigService);

  const makeContext = (params: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    url?: string;
  }): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          url: params.url ?? '/api/v1/bob/categories',
          headers: params.headers ?? {},
          query: params.query ?? {},
        }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    configService.get.mockImplementation((key: string) => {
      if (key === 'bob.guestId') return 'guest-secret';
      if (key === 'bob.apiKey') return 'guest-secret';
      if (key === 'bob.authRequired') return true;
      return undefined;
    });
  });

  it('accepts x-guest-id header', () => {
    expect(
      guard.canActivate(makeContext({ headers: { 'x-guest-id': 'guest-secret' } })),
    ).toBe(true);
  });

  it('accepts x-guest-id query param', () => {
    expect(
      guard.canActivate(makeContext({ query: { 'x-guest-id': 'guest-secret' } })),
    ).toBe(true);
  });

  it('accepts guestId query param', () => {
    expect(guard.canActivate(makeContext({ query: { guestId: 'guest-secret' } }))).toBe(true);
  });

  it('rejects a mismatched key', () => {
    expect(() =>
      guard.canActivate(makeContext({ headers: { 'x-guest-id': 'wrong' } })),
    ).toThrow(UnauthorizedException);
  });

  it('rejects missing key', () => {
    expect(() => guard.canActivate(makeContext({}))).toThrow(UnauthorizedException);
  });

  it('fails closed when auth is required and env key is empty', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'bob.guestId' || key === 'bob.apiKey') return '';
      if (key === 'bob.authRequired') return true;
      return undefined;
    });
    expect(() =>
      guard.canActivate(makeContext({ headers: { 'x-guest-id': 'guest-secret' } })),
    ).toThrow(ServiceUnavailableException);
  });
});
