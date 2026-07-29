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
  it('includes cookie, signature, and auth-sensitive paths', () => {
    expect(LOG_REDACT_PATHS).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-razorpay-signature"]',
        'req.headers["x-webhook-signature"]',
        'req.headers["x-gokwik-callback-secret"]',
        'req.body.password',
        'req.body.otp',
        'req.body.sessionToken',
        '*.signature',
        '*.secret',
      ]),
    );
  });
});
