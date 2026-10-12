import { isSensitiveAuditKey, redactAuditDetails } from './audit-redact.util';

describe('audit redaction', () => {
  it('matches sensitive keys regardless of case or separators', () => {
    expect(isSensitiveAuditKey('Password')).toBe(true);
    expect(isSensitiveAuditKey('access_token')).toBe(true);
    expect(isSensitiveAuditKey('Authorization')).toBe(true);
    expect(isSensitiveAuditKey('accountNumber')).toBe(true);
    expect(isSensitiveAuditKey('title')).toBe(false);
  });

  it('redacts nested objects and arrays without keeping raw secrets', () => {
    const redacted = redactAuditDetails({
      profile: { OTP: '123456', note: 'ok' },
      items: [{ cookie: 'a=b' }, { name: 'Pen' }],
    });
    expect(redacted).toEqual({
      profile: { OTP: '[redacted]', note: 'ok' },
      items: [{ cookie: '[redacted]' }, { name: 'Pen' }],
    });
  });
});
