import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { OtpRepository } from '../repositories/otp.repository';
import { OtpPurpose } from '../enums/otp-purpose.enum';
import {
  generateOtp,
  hashOtp,
  compareOtp,
  getOtpExpiry,
  isOtpExpired,
  OTP_CONFIG,
} from '../utils/otp.util';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly otpRepository: OtpRepository,
  ) {}

  /**
   * Generates, hashes, and persists an OTP for the given mobile number.
   * If an unverified OTP for the same purpose already exists, it is reused
   * with a refreshed code, expiry, and reset attempt counter.
   * Returns the plain OTP for delivery (never persisted in plain text).
   */
  async sendOtp(mobileNumber: string, purpose: OtpPurpose): Promise<string> {
    const plainOtp = generateOtp();
    const hashedOtp = await hashOtp(plainOtp);
    const expiresAt = getOtpExpiry();

    const existing = await this.otpRepository.findActiveByMobileAndPurpose(
      mobileNumber,
      purpose,
    );

    if (existing) {
      await this.otpRepository.updateById(existing.id, {
        otpCode: hashedOtp,
        expiresAt,
        attempts: 0,
      });
      this.logger.log(`OTP refreshed for ${mobileNumber} [${purpose}]`);
    } else {
      await this.otpRepository.create({
        mobileNumber,
        otpCode: hashedOtp,
        purpose,
        expiresAt,
        attempts: 0,
        isVerified: false,
      });
      this.logger.log(`OTP created for ${mobileNumber} [${purpose}]`);
    }

    // Return plain OTP so the caller can dispatch it via SMS provider
    return plainOtp;
  }

  /**
   * Validates the provided OTP against the stored hash.
   * Throws descriptive errors for expired, exceeded-attempts, or invalid OTPs.
   * Marks the OTP as verified on success.
   */
  async verifyOtp(
    mobileNumber: string,
    plainOtp: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const record = await this.otpRepository.findActiveByMobileAndPurpose(
      mobileNumber,
      purpose,
    );

    if (!record) {
      throw new UnprocessableEntityException('No active OTP found. Please request a new OTP.');
    }

    if (isOtpExpired(record.expiresAt)) {
      throw new UnprocessableEntityException('OTP has expired. Please request a new OTP.');
    }

    if (record.attempts >= OTP_CONFIG.MAX_ATTEMPTS) {
      throw new UnprocessableEntityException(
        'Maximum verification attempts reached. Please request a new OTP.',
      );
    }

    const isValid = await compareOtp(plainOtp, record.otpCode);

    if (!isValid) {
      await this.otpRepository.incrementAttempts(record.id);
      const remaining = OTP_CONFIG.MAX_ATTEMPTS - (record.attempts + 1);
      throw new UnprocessableEntityException(
        `Invalid OTP. ${remaining} attempt(s) remaining.`,
      );
    }

    await this.otpRepository.updateById(record.id, {
      isVerified: true,
      verifiedAt: new Date(),
    });

    this.logger.log(`OTP verified for ${mobileNumber} [${purpose}]`);
  }
}
