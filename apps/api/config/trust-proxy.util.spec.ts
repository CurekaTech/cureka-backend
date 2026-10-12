import fastify from 'fastify';
import { normalizeIpAddress, resolveTrustedClientIp } from '@modules/master/utils/audit-ip.util';
import { resolveTrustProxy, TrustProxyConfigurationError } from './trust-proxy.util';

describe('TRUST_PROXY', () => {
  it('parses false, a hop list, and refuses true in production', () => {
    expect(resolveTrustProxy(undefined, 'production')).toBe(false);
    expect(resolveTrustProxy('false', 'production')).toBe(false);
    expect(resolveTrustProxy('10.0.0.1, 10.0.0.2', 'production')).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(resolveTrustProxy('true', 'development')).toBe(true);
    expect(() => resolveTrustProxy('true', 'production')).toThrow(TrustProxyConfigurationError);
  });

  it('normalizes mapped IPv6 and ignores a spoofed forwarding header', () => {
    expect(normalizeIpAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(
      resolveTrustedClientIp({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      } as never),
    ).toBe('127.0.0.1');
  });

  it('accepts the forwarding header only from a trusted hop', async () => {
    const untrusted = fastify({ trustProxy: false });
    untrusted.get('/ip', (request) => ({ ip: normalizeIpAddress(request.ip) }));
    const spoofed = await untrusted.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.8' },
    });
    expect(JSON.parse(spoofed.body).ip).not.toBe('203.0.113.8');
    await untrusted.close();

    const trusted = fastify({ trustProxy: ['127.0.0.1'] });
    trusted.get('/ip', (request) => ({ ip: normalizeIpAddress(request.ip) }));
    const forwarded = await trusted.inject({
      method: 'GET',
      url: '/ip',
      headers: { 'x-forwarded-for': '203.0.113.8' },
    });
    expect(JSON.parse(forwarded.body).ip).toBe('203.0.113.8');
    await trusted.close();
  });
});
