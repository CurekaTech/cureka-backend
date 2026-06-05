import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// ── Admin Auth ───────────────────────────────────────────────────────────────

export class AdminLoginDto {
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  password!: string;
}

// ── User OTP Auth ────────────────────────────────────────────────────────────

export class SendOtpDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  @Matches(/^\d+$/, { message: 'mobileNumber must contain digits only' })
  mobileNumber!: string;
}

export class VerifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(15)
  @Matches(/^\d+$/, { message: 'mobileNumber must contain digits only' })
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
