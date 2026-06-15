import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  INDIAN_MOBILE_REGEX,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  normalizeMobileNumber,
} from '../utils/mobile-number.util';

const MOBILE_VALIDATION_OPTIONS = {
  message: INDIAN_MOBILE_VALIDATION_MESSAGE,
};

const normalizeMobileField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeMobileNumber(value) : value;

// ── Admin Auth ───────────────────────────────────────────────────────────────

export class AdminLoginDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}

// ── User Auth (OTP + Session) ────────────────────────────────────────────────

/** Unified login entry — 10-digit Indian mobile number only. */
export class LoginDto {
  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, MOBILE_VALIDATION_OPTIONS)
  identifier!: string;
}

export class SendOtpDto {
  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, MOBILE_VALIDATION_OPTIONS)
  mobileNumber!: string;
}

export class VerifyOtpDto {
  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, MOBILE_VALIDATION_OPTIONS)
  mobileNumber!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  @Matches(/^\d{4,6}$/, { message: 'otp must be a 4-6 digit number' })
  otp!: string;
}

export class CompleteRegistrationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

/** No body required — guest session is created server-side */
export class GuestLoginDto {}

/** Optional body refresh — browser clients use HttpOnly cookie instead. */
export class RefreshSessionDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
