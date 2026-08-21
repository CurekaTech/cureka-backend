import { IncomingMessage, ServerResponse } from 'http';
import {
  buildPinoHttpOptions,
  resolveLogLevel,
  shouldUsePrettyLogs,
  requestPathFromUrl,
  shouldIgnoreAccessLog,
} from './pino-http.options';
import { LOG_SERVICE_NAME } from './logging.constants';

describe('resolveLogLevel', () => {
  it('silences logs in test', () => {
    expect(resolveLogLevel('test', 'debug')).toBe('silent');
  });

  it('prefers an explicit level outside test', () => {
    expect(resolveLogLevel('production', 'warn')).toBe('warn');
  });

  it('defaults development to debug and other envs to info', () => {
    expect(resolveLogLevel('development')).toBe('debug');
    expect(resolveLogLevel('production')).toBe('info');
    expect(resolveLogLevel('beta')).toBe('info');
    expect(resolveLogLevel('staging')).toBe('info');
  });
});

describe('shouldUsePrettyLogs', () => {
  it('is true only for development', () => {
    expect(shouldUsePrettyLogs('development')).toBe(true);
    expect(shouldUsePrettyLogs('production')).toBe(false);
    expect(shouldUsePrettyLogs('beta')).toBe(false);
    expect(shouldUsePrettyLogs('staging')).toBe(false);
    expect(shouldUsePrettyLogs('test')).toBe(false);
  });
});

describe('requestPathFromUrl / shouldIgnoreAccessLog', () => {
  it('strips query strings', () => {
    expect(requestPathFromUrl('/api/v1/products?q=secret')).toBe('/api/v1/products');
  });

  it('ignores health probes', () => {
    expect(shouldIgnoreAccessLog('/api/v1/health')).toBe(true);
    expect(shouldIgnoreAccessLog('/api/v1/health/redis')).toBe(true);
    expect(shouldIgnoreAccessLog('/api/v1/products')).toBe(false);
  });
});

describe('buildPinoHttpOptions', () => {
  it('emits JSON (no pretty transport) for production-like envs', () => {
    const production = buildPinoHttpOptions({
      nodeEnv: 'production',
      level: 'info',
      service: LOG_SERVICE_NAME,
      environment: 'beta',
    });
    expect(production.transport).toBeUndefined();
    expect(production.level).toBe('info');
    expect(production.messageKey).toBe('message');
    expect(production.base).toEqual(
      expect.objectContaining({
        service: 'cureka-backend',
        environment: 'beta',
      }),
    );
    expect(production.redact).toEqual(
      expect.objectContaining({
        remove: true,
      }),
    );
  });

  it('uses pino-pretty only in development', () => {
    const dev = buildPinoHttpOptions({
      nodeEnv: 'development',
      level: 'debug',
    });
    expect(dev.transport).toEqual(
      expect.objectContaining({
        target: 'pino-pretty',
      }),
    );
  });

  it('flattens HTTP fields on success and error objects', () => {
    const options = buildPinoHttpOptions({
      nodeEnv: 'production',
      level: 'info',
      environment: 'beta',
    });
    const req = {
      id: 'req-123',
      method: 'GET',
      url: '/api/v1/products?q=1',
    } as IncomingMessage;
    const res = { statusCode: 200 } as ServerResponse;

    const success = options.customSuccessObject?.(req, res, { responseTimeMs: 145 });
    expect(success).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/products',
        statusCode: 200,
        responseTimeMs: 145,
      }),
    );

    const erroredRes = { statusCode: 500 } as ServerResponse;
    const error = options.customErrorObject?.(req, erroredRes, new Error('boom'), {
      responseTimeMs: 12,
    });
    expect(error).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/products',
        statusCode: 500,
        responseTimeMs: 12,
      }),
    );
  });

  it('maps status codes to log levels', () => {
    const options = buildPinoHttpOptions({ nodeEnv: 'production', level: 'info' });
    const req = {} as IncomingMessage;
    expect(options.customLogLevel?.(req, { statusCode: 200 } as ServerResponse)).toBe('info');
    expect(options.customLogLevel?.(req, { statusCode: 404 } as ServerResponse)).toBe('warn');
    expect(options.customLogLevel?.(req, { statusCode: 500 } as ServerResponse)).toBe('error');
  });

  it('formats level as a string with GCP severity', () => {
    const options = buildPinoHttpOptions({ nodeEnv: 'production', level: 'info' });
    expect(options.formatters?.level?.('info', 30)).toEqual({
      level: 'info',
      severity: 'INFO',
    });
    expect(options.formatters?.level?.('error', 50)).toEqual({
      level: 'error',
      severity: 'ERROR',
    });
    expect(options.formatters?.level?.('warn', 40)).toEqual({
      level: 'warn',
      severity: 'WARNING',
    });
  });

  it('does not log request or response bodies in serializers', () => {
    const options = buildPinoHttpOptions({ nodeEnv: 'production', level: 'info' });
    const serializedReq = options.serializers?.['req']?.({
      method: 'POST',
      url: '/api/v1/login?x=1',
      id: 'abc',
      body: { password: 'secret', email: 'a@b.c' },
      headers: { authorization: 'Bearer secret' },
    });
    expect(serializedReq).toEqual({
      method: 'POST',
      url: '/api/v1/login',
      id: 'abc',
      remoteAddress: undefined,
    });
    expect(serializedReq).not.toHaveProperty('body');
    expect(serializedReq).not.toHaveProperty('headers');

    const serializedRes = options.serializers?.['res']?.({
      statusCode: 201,
      body: { accessToken: 'tok' },
    });
    expect(serializedRes).toEqual({ statusCode: 201 });
    expect(serializedRes).not.toHaveProperty('body');
  });
});
