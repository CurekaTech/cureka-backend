import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GokwikCallbackGuard } from './gokwik-callback.guard';

const contextWithHeader = (value?: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        headers: value ? { 'x-gokwik-callback-secret': value } : {},
      }),
    }),
  }) as unknown as ExecutionContext;

describe('GokwikCallbackGuard', () => {
  it('fails closed when callback auth is required but not configured', () => {
    const config = {
      get: (key: string) => (key === 'gokwik.callbackAuthRequired' ? true : ''),
    } as ConfigService;
    const guard = new GokwikCallbackGuard(config);
    expect(() => guard.canActivate(contextWithHeader())).toThrow(ServiceUnavailableException);
  });

  it('rejects an invalid callback secret', () => {
    const config = {
      get: (key: string) =>
        key === 'gokwik.callbackSecret'
          ? 'expected-secret'
          : key === 'gokwik.callbackAuthRequired'
            ? true
            : undefined,
    } as ConfigService;
    const guard = new GokwikCallbackGuard(config);
    expect(() => guard.canActivate(contextWithHeader('wrong-secret'))).toThrow(
      UnauthorizedException,
    );
  });

  it('accepts an exact callback secret', () => {
    const config = {
      get: (key: string) =>
        key === 'gokwik.callbackSecret'
          ? 'expected-secret'
          : key === 'gokwik.callbackAuthRequired'
            ? true
            : undefined,
    } as ConfigService;
    const guard = new GokwikCallbackGuard(config);
    expect(guard.canActivate(contextWithHeader('expected-secret'))).toBe(true);
  });
});
