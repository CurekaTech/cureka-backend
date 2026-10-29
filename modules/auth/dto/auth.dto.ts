import { Transform } from 'class-transformer';
import {
  IsDateString,
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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
  @IsNotEmpty({ message: 'First name is required.' })
  @IsString()
  @MaxLength(100, { message: 'First name must be 100 characters or fewer.' })
  firstName!: string;

  @IsNotEmpty({ message: 'Last name is required.' })
  @IsString()
  @MaxLength(100, { message: 'Last name must be 100 characters or fewer.' })
  lastName!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @MaxLength(255, { message: 'Email address must be 255 characters or fewer.' })
  email?: string;

  @IsNotEmpty({ message: 'Date of birth is required.' })
  @IsDateString(
    {},
    { message: 'dateOfBirth must be a valid ISO 8601 date string (e.g. 1990-06-15)' },
  )
  dateOfBirth!: string;
}

/** No body required — guest session is created server-side */
export class GuestLoginDto {}

/** Optional body refresh — browser clients use HttpOnly cookie instead. */
export class RefreshSessionDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
