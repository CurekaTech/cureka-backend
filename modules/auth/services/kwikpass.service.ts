import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

export interface IKwikpassPublicConfig {
  enabled: boolean;
  merchantId: string;
  environment: 'sandbox' | 'production';
  sdkUrl: string;
}

@Injectable()
export class KwikpassService {
  private readonly logger = new Logger(KwikpassService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  // ── Public helpers ───────────────────────────────────────────────────────────

  /**
   * Returns true when the minimum KwikPass config (merchant ID + JWE secret)
   * is present. Used by the config endpoint and feature flags.
   */
  isConfigured(): boolean {
    const merchantId = this.configService.get<string>('gokwik.kwikpass.merchantId')?.trim();
    const jweSecret = this.configService.get<string>('gokwik.kwikpass.jweSecret')?.trim();
    return Boolean(merchantId && jweSecret);
  }

  /**
   * Returns the frontend SDK bootstrap config.
   * The frontend embeds `merchantId` + `environment` into `window.merchantInfo`
   * when loading the KwikPass SDK script.
   */
  getPublicConfig(): IKwikpassPublicConfig {
    const environment =
      (this.configService.get<string>('gokwik.kwikpass.environment') ?? 'sandbox') as
        | 'sandbox'
        | 'production';
    const merchantId = this.configService.get<string>('gokwik.kwikpass.merchantId') ?? '';

    // Use KWIKPASS_BASE_URL if GoKwik provided it; otherwise derive from environment.
    const configuredBase = this.configService.get<string>('gokwik.kwikpass.baseUrl')?.trim();
    const sdkBase =
      configuredBase ||
      (environment === 'production' ? 'https://pdp.gokwik.co' : 'https://sandbox.pdp.gokwik.co');
    const sdkUrl = `${sdkBase.replace(/\/+$/, '')}/kwikpass/plugin/build/kp-custom-merchant.js`;

    return {
      enabled: this.isConfigured(),
      merchantId,
      environment,
      sdkUrl,
    };
  }

  // ── Token exchange ───────────────────────────────────────────────────────────

  /**
   * Exchanges a KwikPass `kpToken` (JWE) for a Cureka session.
   * Called after:
   *   a) KwikPass SSO event fires on the frontend (`kwikpass-sso`)
   *   b) KwikPass OTP verification on the frontend (`kpVerifyOTP`)
   */
  async exchange(
    token: string,
    device: IDeviceContext,
    guestUserId?: string | null,
  ): Promise<IUserAuthTokensResult> {
    this.logger.log('[exchange] Received kpToken exchange request');

    const claims = await this.decryptAndValidate(token);
    const rawPhone = claims.mobile_number ?? claims.mobile ?? claims.phone;

    this.logger.log(
      `[exchange] Token claims — phone="${rawPhone}" merchant_id="${claims.merchant_id}" iss="${claims.iss ?? '(none)'}"`,
    );

    if (!rawPhone) {
      this.logger.warn('[exchange] kpToken does not contain a mobile number field');
      throw new UnauthorizedException('KwikPass token does not contain a mobile number');
    }

    const phone = parseIndianMobileNumber(rawPhone);
    if (!phone) {
      this.logger.warn(`[exchange] Could not parse mobile number from kpToken: "${rawPhone}"`);
      throw new UnauthorizedException('KwikPass token contains an invalid mobile number');
    }

    this.logger.log(`[exchange] Logging in user with verified mobile: ${phone}`);
    const result = await this.authService.loginWithVerifiedMobile(phone, device, guestUserId);

    this.logger.log(
      `[exchange] Session created — sessionId=${result.sessionId} isRegistered=${result.isRegistered}`,
    );
    return result;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async decryptAndValidate(token: string): Promise<KwikpassClaims> {
    const secret = this.configService.get<string>('gokwik.kwikpass.jweSecret')?.trim();
    if (!secret) {
      this.logger.error('[decryptAndValidate] KWIKPASS_JWE_SECRET is not configured');
      throw new ServiceUnavailableException('KwikPass JWE decryption is not configured');
    }

    try {
      const key = await this.resolveKey(secret);
      const { plaintext, protectedHeader } = await compactDecrypt(token.trim(), key, {
        keyManagementAlgorithms: ['dir'],
        contentEncryptionAlgorithms: ['A256GCM'],
      });

      if (protectedHeader.alg !== 'dir' || protectedHeader.enc !== 'A256GCM') {
        throw new Error(
          `Unexpected KwikPass JWE algorithms: alg=${protectedHeader.alg} enc=${protectedHeader.enc}`,
        );
      }

      const claims = JSON.parse(new TextDecoder().decode(plaintext)) as KwikpassClaims;
      this.validateClaims(claims);
      return claims;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[decryptAndValidate] Token validation failed: ${msg}`);
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
      this.logger.error(
        `[resolveKey] KWIKPASS_JWE_SECRET decoded to ${decoded.length} bytes (base64url) / ${raw.length} bytes (utf8) — must be 32 bytes`,
      );
      throw new ServiceUnavailableException('KWIKPASS_JWE_SECRET must be a 256-bit (32-byte) key');
    }
    return raw;
  }

  private validateClaims(claims: KwikpassClaims): void {
    const now = Math.floor(Date.now() / 1000);

    if (!claims.exp || claims.exp <= now) {
      throw new Error(`KwikPass token is expired (exp=${claims.exp}, now=${now})`);
    }
    if (claims.nbf !== undefined && claims.nbf > now + 30) {
      throw new Error(`KwikPass token is not yet active (nbf=${claims.nbf}, now=${now})`);
    }

    const expectedIssuer = this.configService.get<string>('gokwik.kwikpass.issuer')?.trim();
    if (expectedIssuer && claims.iss !== expectedIssuer) {
      throw new Error(`KwikPass issuer mismatch: got "${claims.iss}", expected "${expectedIssuer}"`);
    }

    const expectedAudience = this.configService.get<string>('gokwik.kwikpass.audience')?.trim();
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (expectedAudience && !audiences.includes(expectedAudience)) {
      throw new Error(
        `KwikPass audience mismatch: got [${audiences.join(', ')}], expected "${expectedAudience}"`,
      );
    }

    const merchantId = this.configService.get<string>('gokwik.kwikpass.merchantId')?.trim();
    if (merchantId && claims.merchant_id !== merchantId) {
      throw new Error(
        `KwikPass merchant mismatch: got "${claims.merchant_id}", expected "${merchantId}"`,
      );
    }
  }
}
