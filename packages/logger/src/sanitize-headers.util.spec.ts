import { sanitizeHeadersForLog } from './sanitize-headers.util';

describe('sanitizeHeadersForLog', () => {
  it('keeps safe headers and drops secrets', () => {
    const sanitized = sanitizeHeadersForLog({
      'Content-Type': 'application/json',
      'Content-Length': '12',
      Date: 'Fri, 21 Aug 2026 07:00:00 GMT',
      'Cache-Control': 'no-store',
      Authorization: 'Bearer secret-token-abc',
      Cookie: 'session=abc',
      'Set-Cookie': 'session=abc; Path=/',
      'Proxy-Authorization': 'Basic xyz',
      'x-api-key': 'gk-secret',
      authkey: 'msg91-auth-key',
      'gk-app-secret': 'gokwik-secret',
    });

    expect(sanitized).toEqual({
      'content-type': 'application/json',
      'content-length': '12',
      date: 'Fri, 21 Aug 2026 07:00:00 GMT',
      'cache-control': 'no-store',
    });
    expect(JSON.stringify(sanitized)).not.toContain('secret-token-abc');
    expect(JSON.stringify(sanitized)).not.toContain('session=abc');
    expect(JSON.stringify(sanitized)).not.toContain('msg91-auth-key');
    expect(JSON.stringify(sanitized)).not.toContain('gk-secret');
  });

  it('handles Fetch Headers-like objects', () => {
    const headers = {
      forEach(cb: (value: string, key: string) => void) {
        cb('application/json', 'content-type');
        cb('Bearer leaked', 'authorization');
        cb('session=leak', 'set-cookie');
      },
    };

    expect(sanitizeHeadersForLog(headers)).toEqual({
      'content-type': 'application/json',
    });
  });
});
