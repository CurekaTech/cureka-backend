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
  // Standard JWT claims (may be absent in GoKwik sandbox tokens)
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  // GoKwik-specific claims
  merchant_id?: string;
  country_code?: string;
  email?: string;
  // Phone — GoKwik uses different field names across environments
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

  /**
   * Decrypts a kpToken and returns its raw claims for diagnostic purposes.
   * Does NOT create a session. Use from Postman to debug token issues.
   */
  async probe(token: string): Promise<Record<string, unknown>> {
    this.logger.log('[probe] Decrypting kpToken for diagnostic inspection');

    const config = this.getPublicConfig();
    this.logger.log(
      `[probe] Current config — enabled=${config.enabled} merchantId="${config.merchantId}" env="${config.environment}"`,
    );

    const secret = this.configService.get<string>('gokwik.kwikpass.jweSecret')?.trim();
    this.logger.log(`[probe] JWE secret present=${Boolean(secret)} length=${secret?.length ?? 0}`);

    const expectedIssuer = this.configService.get<string>('gokwik.kwikpass.issuer')?.trim();
    const expectedAudience = this.configService.get<string>('gokwik.kwikpass.audience')?.trim();
    const expectedMerchantId = this.configService.get<string>('gokwik.kwikpass.merchantId')?.trim();
    this.logger.log(
      `[probe] Validation config — issuer="${expectedIssuer || '(skip)'}" audience="${expectedAudience || '(skip)'}" merchantId="${expectedMerchantId || '(skip)'}"`,
    );

    if (!secret) {
      return {
        ok: false,
        stage: 'config',
        error: 'KWIKPASS_JWE_SECRET is not configured on the server',
        config: { merchantId: config.merchantId, environment: config.environment },
      };
    }

    if (!token?.trim()) {
      return { ok: false, stage: 'input', error: 'No kpToken provided' };
    }

    try {
      const key = await this.resolveKey(secret);
      // No algorithm restriction — log whatever GoKwik actually sends.
      const { plaintext, protectedHeader } = await compactDecrypt(token.trim(), key);

      const claims = JSON.parse(new TextDecoder().decode(plaintext)) as KwikpassClaims;
      const now = Math.floor(Date.now() / 1000);
      const rawPhone = claims.mobile_number ?? claims.mobile ?? claims.phone;
      const phone = rawPhone ? parseIndianMobileNumber(rawPhone) : null;

      const result: Record<string, unknown> = {
        ok: true,
        stage: 'decrypted',
        protectedHeader: {
          alg: protectedHeader.alg,
          enc: protectedHeader.enc,
        },
        claims,
        derived: {
          rawPhone,
          parsedPhone: phone,
          isExpired: !claims.exp || claims.exp <= now,
          expiresInSeconds: claims.exp ? claims.exp - now : null,
          issuerMatch:
            !expectedIssuer || claims.iss === expectedIssuer
              ? 'ok'
              : `MISMATCH: token="${claims.iss}" expected="${expectedIssuer}"`,
          audienceMatch: !expectedAudience
            ? 'ok (not configured)'
            : (Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : []).includes(
                  expectedAudience,
                )
              ? 'ok'
              : `MISMATCH: token="${JSON.stringify(claims.aud)}" expected="${expectedAudience}"`,
          merchantIdMatch:
            !expectedMerchantId || claims.merchant_id === expectedMerchantId
              ? 'ok'
              : `MISMATCH: token="${claims.merchant_id}" expected="${expectedMerchantId}"`,
        },
      };

      this.logger.log(`[probe] Decryption successful — rawPhone="${rawPhone}" exp=${claims.exp}`);
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[probe] Decryption failed: ${msg}`);
      return {
        ok: false,
        stage: 'decrypt',
        error: msg,
        hint: 'Check that KWIKPASS_JWE_SECRET on the server matches the key GoKwik provided',
      };
    }
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
      // Do NOT restrict algorithms — let jose accept whatever alg+enc GoKwik uses.
      const { plaintext, protectedHeader } = await compactDecrypt(token.trim(), key);

      this.logger.log(
        `[decryptAndValidate] JWE header — alg="${protectedHeader.alg}" enc="${protectedHeader.enc}"`,
      );

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
    // JWK object
    if (secret.startsWith('{')) {
      const jwk = JSON.parse(secret) as JWK;
      return importJWK(jwk, 'A256GCM');
    }

    // Try base64url first (most common from GoKwik)
    const decodedUrl = Buffer.from(secret, 'base64url');
    this.logger.log(
      `[resolveKey] Secret length=${secret.length} chars → base64url decoded=${decodedUrl.length} bytes`,
    );
    if (decodedUrl.length >= 16) {
      // Valid key size for AES-128 (16 bytes) or AES-256 (32 bytes)
      return decodedUrl;
    }

    // Try standard base64 (with + / characters)
    const decodedBase64 = Buffer.from(secret, 'base64');
    if (decodedBase64.length >= 16) {
      this.logger.log(`[resolveKey] Using standard base64 decoded key (${decodedBase64.length} bytes)`);
      return decodedBase64;
    }

    // Raw UTF-8 string key
    const raw = Buffer.from(secret, 'utf8');
    this.logger.log(`[resolveKey] Using raw UTF-8 key (${raw.length} bytes)`);
    return raw;
  }

  private validateClaims(claims: KwikpassClaims): void {
    const now = Math.floor(Date.now() / 1000);

    // Log all claim keys so we can see the exact token structure GoKwik sends.
    this.logger.log(`[validateClaims] Claim keys present: [${Object.keys(claims).join(', ')}]`);
    this.logger.log(
      `[validateClaims] exp=${claims.exp} nbf=${claims.nbf} iss="${claims.iss}" merchant_id="${claims.merchant_id}" phone fields: mobile_number="${claims.mobile_number}" mobile="${claims.mobile}" phone="${claims.phone}"`,
    );

    // Expiry check — GoKwik tokens may omit `exp`; treat absence as valid but warn.
    if (claims.exp !== undefined) {
      if (claims.exp <= now) {
        throw new Error(`KwikPass token is expired (exp=${claims.exp}, now=${now})`);
      }
    } else {
      this.logger.warn(
        '[validateClaims] kpToken has no `exp` field — skipping expiry check (GoKwik sandbox tokens may omit it)',
      );
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
    // Only check merchant_id when it is actually present in the token.
    // GoKwik sandbox tokens omit this field entirely.
    if (merchantId && 'merchant_id' in claims && claims.merchant_id !== merchantId) {
      throw new Error(
        `KwikPass merchant mismatch: got "${claims.merchant_id}", expected "${merchantId}"`,
      );
    }
  }
}
