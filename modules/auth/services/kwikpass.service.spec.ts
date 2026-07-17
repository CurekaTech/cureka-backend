import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CompactEncrypt } from 'jose';
import { AuthService } from './auth.service';
import { KwikpassService } from './kwikpass.service';

describe('KwikpassService', () => {
  const secret = Buffer.alloc(32, 7);
  const config = {
    get: (key: string) => {
      const values: Record<string, string> = {
        'gokwik.kwikpass.jweSecret': secret.toString('base64url'),
        'gokwik.kwikpass.merchantId': 'merchant-1',
        'gokwik.kwikpass.issuer': 'gokwik',
        'gokwik.kwikpass.audience': 'cureka',
      };
      return values[key];
    },
  } as ConfigService;

  const authService = {
    loginWithVerifiedMobile: jest.fn().mockResolvedValue({ sessionToken: 'session' }),
  } as unknown as AuthService;

  beforeEach(() => jest.clearAllMocks());

  it('decrypts verified claims and delegates session creation', async () => {
    const token = await encrypt({
      mobile_number: '9876543210',
      merchant_id: 'merchant-1',
      iss: 'gokwik',
      aud: 'cureka',
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    const service = new KwikpassService(config, authService);

    await service.exchange(token, { deviceId: 'test', ipAddress: '127.0.0.1' }, 'guest-id');

    expect(authService.loginWithVerifiedMobile).toHaveBeenCalledWith(
      '9876543210',
      { deviceId: 'test', ipAddress: '127.0.0.1' },
      'guest-id',
    );
  });

  it('rejects expired claims before creating a session', async () => {
    const token = await encrypt({
      mobile_number: '9876543210',
      merchant_id: 'merchant-1',
      iss: 'gokwik',
      aud: 'cureka',
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    const service = new KwikpassService(config, authService);

    await expect(
      service.exchange(token, { deviceId: 'test', ipAddress: '127.0.0.1' }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authService.loginWithVerifiedMobile).not.toHaveBeenCalled();
  });

  function encrypt(claims: Record<string, unknown>): Promise<string> {
    return new CompactEncrypt(Buffer.from(JSON.stringify(claims)))
      .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
      .encrypt(secret);
  }
});
