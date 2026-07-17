import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IDeviceContext } from '../interfaces/session.interface';
import { IUserAuthTokensResult } from '../interfaces/auth.interface';
import { parseIndianMobileNumber } from '../utils/mobile-number.util';
import { AuthService } from './auth.service';
import { compactDecrypt, importJWK, JWK, KeyLike } from 'jose';

type KwikpassClaims = {
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  merchant_id?: string;
  phone?: string;
  mobile?: string;
  mobile_number?: string;
};

@Injectable()
export class KwikpassService {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async exchange(
    token: string,
    device: IDeviceContext,
    guestUserId?: string | null,
  ): Promise<IUserAuthTokensResult> {
    const claims = await this.decryptAndValidate(token);
    const phone = claims.mobile_number ?? claims.mobile ?? claims.phone;
    if (!phone) {
      throw new UnauthorizedException('KwikPass token does not contain a mobile number');
    }
    return this.authService.loginWithVerifiedMobile(
      parseIndianMobileNumber(phone),
      device,
      guestUserId,
    );
  }

  private async decryptAndValidate(token: string): Promise<KwikpassClaims> {
    const secret = this.configService.get<string>('gokwik.kwikpass.jweSecret')?.trim();
    if (!secret) {
      throw new ServiceUnavailableException('KwikPass JWE decryption is not configured');
    }

    try {
      const key = await this.resolveKey(secret);
      const { plaintext, protectedHeader } = await compactDecrypt(token.trim(), key, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      });
      if (protectedHeader.alg !== 'dir' || protectedHeader.enc !== 'A256GCM') {
        throw new Error('Unexpected KwikPass JWE algorithms');
      }
      const claims = JSON.parse(new TextDecoder().decode(plaintext)) as KwikpassClaims;
      this.validateClaims(claims);
      return claims;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired KwikPass token');
    }
  }

  private async resolveKey(secret: string): Promise<Uint8Array | KeyLike> {
    if (secret.startsWith('{')) {
      const jwk = JSON.parse(secret) as JWK;
      return importJWK(jwk, 'A256GCM');
    }

    const decoded = Buffer.from(secret, 'base64url');
    if (decoded.length === 32) {
      return decoded;
    }
    const raw = Buffer.from(secret, 'utf8');
    if (raw.length !== 32) {
      throw new ServiceUnavailableException('KWIKPASS_JWE_SECRET must be a 256-bit key');
    }
    return raw;
  }

  private validateClaims(claims: KwikpassClaims): void {
    const now = Math.floor(Date.now() / 1000);
    if (!claims.exp || claims.exp <= now || (claims.nbf !== undefined && claims.nbf > now + 30)) {
      throw new Error('KwikPass token is expired or not active');
    }

    const expectedIssuer = this.configService.get<string>('gokwik.kwikpass.issuer')?.trim();
    if (expectedIssuer && claims.iss !== expectedIssuer) {
      throw new Error('KwikPass issuer mismatch');
    }
    const expectedAudience = this.configService.get<string>('gokwik.kwikpass.audience')?.trim();
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (expectedAudience && !audiences.includes(expectedAudience)) {
      throw new Error('KwikPass audience mismatch');
    }
    const merchantId = this.configService.get<string>('gokwik.kwikpass.merchantId')?.trim();
    if (merchantId && claims.merchant_id !== merchantId) {
      throw new Error('KwikPass merchant mismatch');
    }
  }
}
