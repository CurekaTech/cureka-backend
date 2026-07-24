import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import {
  OTP_RATE_LIMIT,
  OtpRateLimitCounter,
} from '../constants/otp-rate-limit.constants';

@Injectable()
export class OtpRateLimitService {
  private readonly logger = new Logger(OtpRateLimitService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  async assertCanSendOtp(mobileNumber: string, ipAddress?: string): Promise<void> {
    const mobileMax = this.configService.get<number>(
      'OTP_MOBILE_MAX_REQUESTS',
      OTP_RATE_LIMIT.MOBILE_MAX_REQUESTS,
    );
    const ipMax = this.configService.get<number>(
      'OTP_IP_MAX_REQUESTS',
      OTP_RATE_LIMIT.IP_MAX_REQUESTS,
    );
    const windowSeconds = this.configService.get<number>(
      'OTP_RATE_LIMIT_WINDOW_SECONDS',
      OTP_RATE_LIMIT.WINDOW_SECONDS,
    );

    await this.assertUnderLimit(
      `otp:rate:mobile:${mobileNumber}`,
      mobileMax,
      windowSeconds,
      'You have requested too many OTPs for this number. Please wait 15 minutes and try again.',
    );

    if (ipAddress && !this.isLoopbackIp(ipAddress)) {
      await this.assertUnderLimit(
        `otp:rate:ip:${ipAddress}`,
        ipMax,
        windowSeconds,
        'Too many OTP requests from your network. Please wait 15 minutes and try again.',
      );
    }
  }

  private async assertUnderLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number,
    message: string,
  ): Promise<void> {
    try {
      const now = Date.now();
      const existing = await this.cache.get<OtpRateLimitCounter>(key);
      const counter: OtpRateLimitCounter =
        existing && existing.resetAt > now
          ? existing
          : { count: 0, resetAt: now + windowSeconds * 1000 };

      if (counter.count >= maxRequests) {
        throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
      }

      const next: OtpRateLimitCounter = {
        count: counter.count + 1,
        resetAt: counter.resetAt,
      };
      const ttlMs = Math.max(1000, next.resetAt - now);
      await this.cache.set(key, next, ttlMs);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.warn(
        `OTP rate-limit cache unavailable (${error instanceof Error ? error.message : 'unknown error'}). Skipping rate limit check. Start Redis: npm run redis:dev`,
      );
    }
  }

  private isLoopbackIp(ipAddress: string): boolean {
    const ip = ipAddress.trim().toLowerCase();
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip === '::ffff:127.0.0.1' ||
      ip.startsWith('127.')
    );
  }
}
