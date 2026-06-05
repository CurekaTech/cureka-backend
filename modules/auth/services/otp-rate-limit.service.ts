import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { OTP_RATE_LIMIT } from '../constants/otp-rate-limit.constants';

@Injectable()
export class OtpRateLimitService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async assertCanSendOtp(mobileNumber: string, ipAddress?: string): Promise<void> {
    await this.assertUnderLimit(
      `otp:rate:mobile:${mobileNumber}`,
      OTP_RATE_LIMIT.MOBILE_MAX_REQUESTS,
      'You have requested too many OTPs for this number. Please wait 15 minutes and try again.',
    );

    if (ipAddress) {
      await this.assertUnderLimit(
        `otp:rate:ip:${ipAddress}`,
        OTP_RATE_LIMIT.IP_MAX_REQUESTS,
        'Too many OTP requests from your network. Please wait 15 minutes and try again.',
      );
    }
  }

  private async assertUnderLimit(
    key: string,
    maxRequests: number,
    message: string,
  ): Promise<void> {
    const current = (await this.cache.get<number>(key)) ?? 0;

    if (current >= maxRequests) {
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const ttlMs = OTP_RATE_LIMIT.WINDOW_SECONDS * 1000;
    await this.cache.set(key, current + 1, ttlMs);
  }
}
