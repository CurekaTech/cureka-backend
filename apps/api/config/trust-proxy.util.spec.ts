import fastify from 'fastify';
import { normalizeIpAddress, resolveTrustedClientIp } from '@modules/master/utils/audit-ip.util';
import { resolveTrustProxy, TrustProxyConfigurationError } from './trust-proxy.util';

describe('TRUST_PROXY', () => {
  it('trusts loopback when unset, a hop list when set, and nobody when false', () => {
    expect(resolveTrustProxy(undefined, 'production')).toBe('loopback');
    expect(resolveTrustProxy('   ', 'development')).toBe('loopback');
    expect(resolveTrustProxy('false', 'production')).toBe(false);
    expect(resolveTrustProxy('false', 'development')).toBe(false);
    expect(resolveTrustProxy('10.0.0.1, 10.0.0.2', 'production')).toEqual(['10.0.0.1', '10.0.0.2']);
    expect(resolveTrustProxy('loopback, uniquelocal', 'production')).toEqual(['loopback', 'uniquelocal']);
  });

  it('rejects unrestricted trust in production and development', () => {
    for (const nodeEnv of ['production', 'development']) {
      expect(() => resolveTrustProxy('true', nodeEnv)).toThrow(TrustProxyConfigurationError);
      expect(() => resolveTrustProxy('0.0.0.0/0', nodeEnv)).toThrow(/trusts every address/);
      expect(() => resolveTrustProxy('::/0', nodeEnv)).toThrow(/trusts every address/);
    }
    expect(() => resolveTrustProxy('10.0.0.1, 0.0.0.0/0', 'production')).toThrow(/trusts every address/);
  });

  it('rejects an invalid IP or CIDR with a clear error', () => {
    expect(() => resolveTrustProxy('999.1.1.1', 'production')).toThrow(/not a valid IP/);
    expect(() => resolveTrustProxy('10.0.0.1/99', 'production')).toThrow(/not a valid IP/);
    expect(() => resolveTrustProxy('not-a-proxy', 'development')).toThrow(TrustProxyConfigurationError);
  });

  it('normalizes mapped IPv6 and does not read a raw forwarding header itself', () => {
    expect(normalizeIpAddress('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(
      resolveTrustedClientIp({
        ip: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.9' },
      } as never),
    ).toBe('127.0.0.1');
  });

  it('does not let an untrusted forwarding header override the socket peer', async () => {
    const ip = await readIp(resolveTrustProxy(undefined, 'production'), {
      remoteAddress: '35.244.39.1',
      forwardedFor: '103.161.99.162',
    });
    expect(ip).toBe('35.244.39.1');
  });

  it('resolves the forwarded client from a loopback peer when loopback is trusted', async () => {
    const ip = await readIp(resolveTrustProxy(undefined, 'production'), {
      remoteAddress: '127.0.0.1',
      forwardedFor: '103.161.99.162',
    });
    expect(ip).toBe('103.161.99.162');
  });

  it('uses the nearest untrusted hop when several proxies are in the chain', async () => {
    const ip = await readIp(resolveTrustProxy('10.1.1.1', 'production'), {
      remoteAddress: '10.1.1.1',
      forwardedFor: '203.0.113.50, 10.9.9.9',
    });
    expect(ip).toBe('10.9.9.9');
  });

  it('resolves the client address from a configured trusted proxy IP', async () => {
    const ip = await readIp(resolveTrustProxy('10.8.0.4', 'production'), {
      remoteAddress: '10.8.0.4',
      forwardedFor: '103.161.99.162',
    });
    expect(ip).toBe('103.161.99.162');
  });

  it('does not let an untrusted peer spoof X-Forwarded-For', async () => {
    const ip = await readIp(resolveTrustProxy('10.8.0.4', 'production'), {
      remoteAddress: '198.51.100.23',
      forwardedFor: '103.161.99.162',
    });
    expect(ip).toBe('198.51.100.23');
  });

  it('trusts no proxy when TRUST_PROXY is false, including a loopback peer', async () => {
    const ip = await readIp(resolveTrustProxy('false', 'production'), {
      remoteAddress: '127.0.0.1',
      forwardedFor: '103.161.99.162',
    });
    expect(ip).toBe('127.0.0.1');
  });

  it('trusts the whole loopback range, including ::1', async () => {
    const trust = resolveTrustProxy(undefined, 'production');
    await expect(
      readIp(trust, { remoteAddress: '127.0.0.2', forwardedFor: '103.161.99.162' }),
    ).resolves.toBe('103.161.99.162');
    await expect(
      readIp(trust, { remoteAddress: '::1', forwardedFor: '103.161.99.162' }),
    ).resolves.toBe('103.161.99.162');
  });
});

async function readIp(
  trustProxy: boolean | string | string[],
  options: { remoteAddress: string; forwardedFor?: string },
): Promise<string | null> {
  const app = fastify({ trustProxy });
  app.get('/ip', (request) => ({ ip: normalizeIpAddress(request.ip) }));
  const response = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: options.remoteAddress,
    headers: options.forwardedFor ? { 'x-forwarded-for': options.forwardedFor } : {},
  });
  await app.close();
  return JSON.parse(response.body).ip as string | null;
}
