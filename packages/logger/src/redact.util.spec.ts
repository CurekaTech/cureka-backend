import { Writable } from 'stream';
import pino from 'pino';
import { maskMobile } from './redact.util';
import { LOG_REDACT_PATHS } from './logging.constants';

describe('maskMobile', () => {
  it('masks keeping last 4 digits', () => {
    expect(maskMobile('9876543210')).toBe('***3210');
    expect(maskMobile('+91 98765 43210')).toBe('***3210');
  });

  it('handles short and empty values', () => {
    expect(maskMobile('12')).toBe('***12');
    expect(maskMobile('')).toBe('***');
    expect(maskMobile(null)).toBe('');
    expect(maskMobile(undefined)).toBe('');
  });
});

describe('LOG_REDACT_PATHS', () => {
  it('includes cookie, signature, auth, PII, and payment-sensitive paths', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'req.headers["x-razorpay-signature"]',
        'req.headers["x-webhook-signature"]',
        'req.headers["x-gokwik-callback-secret"]',
        'req.headers["x-api-key"]',
        'req.body.password',
        'req.body.passwordConfirmation',
        'req.body.otp',
        'req.body.sessionToken',
        'req.body.accessToken',
        'req.body.email',
        'req.body.mobile',
        'req.body.cardNumber',
        'req.body.cvv',
        'req.body.prescription',
        '*.password',
        '*.passwordConfirmation',
        '*.accessToken',
        '*.refreshToken',
        '*.token',
        '*.otp',
        '*.apiKey',
        '*.secret',
        '*.cardNumber',
        '*.cvv',
        '*.email',
        '*.phone',
        '*.mobile',
        '*.prescription',
        '*.patient',
        '*.signature',
      ]),
    );
  });

  it('removes sensitive values from JSON output', () => {
    const chunks: Buffer[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    const logger = pino(
      {
        redact: { paths: LOG_REDACT_PATHS, remove: true },
      },
      stream,
    );

    logger.info({
      orderId: 'ORD-1',
      password: 'hunter2',
      email: 'user@example.com',
      authorization: 'Bearer abc',
      otp: '123456',
      cardNumber: '4111111111111111',
      cvv: '123',
      nested: { accessToken: 'tok_secret', mobile: '9876543210' },
    });

    const line = Buffer.concat(chunks).toString('utf8');
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed['orderId']).toBe('ORD-1');
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('authorization');
    expect(parsed).not.toHaveProperty('otp');
    expect(parsed).not.toHaveProperty('cardNumber');
    expect(parsed).not.toHaveProperty('cvv');
    expect(parsed['nested']).toEqual({});
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('user@example.com');
    expect(line).not.toContain('Bearer abc');
    expect(line).not.toContain('123456');
    expect(line).not.toContain('4111111111111111');
    expect(line).not.toContain('tok_secret');
    expect(line).not.toContain('9876543210');
  });
});
