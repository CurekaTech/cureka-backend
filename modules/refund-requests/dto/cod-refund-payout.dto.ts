import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class VerifyCodPayoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class MarkCodPayoutPaidDto {
  @ApiProperty({ description: 'Bank UTR / transaction reference. Required to complete a COD bank refund.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(64)
  utr!: string;

  @ApiProperty({ description: 'Date the transfer left the company account (YYYY-MM-DD).' })
  @IsDateString()
  transferDate!: string;

  @ApiPropertyOptional({ description: 'Storage path of a transfer receipt uploaded through the existing media API.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  paymentProofPath?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  customerVisibleNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class FailCodPayoutDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class HoldCodPayoutDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RetryCodPayoutDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  comment!: string;
}

export class ReopenCodPayoutVerificationDto {
  @ApiProperty({ description: 'Why bank details must be collected again.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class CodPayoutCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

/** Rejects values that look like passwords, PINs or OTPs rather than an account number. */
export const ACCOUNT_NUMBER_PATTERN = /^\d{9,18}$/;
export const IFSC_DTO_PATTERN = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

export class BankAccountDetailsDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(150)
  accountHolderName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(ACCOUNT_NUMBER_PATTERN, { message: 'Account number must be 9–18 digits' })
  accountNumber!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(ACCOUNT_NUMBER_PATTERN, { message: 'Confirm account number must be 9–18 digits' })
  confirmAccountNumber!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Matches(IFSC_DTO_PATTERN, { message: 'IFSC must look like ABCD0XXXXXX' })
  ifsc!: string;

  @ApiPropertyOptional({ description: 'Optional. Resolved from IFSC when omitted.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  bankName?: string;

  @ApiPropertyOptional({ description: 'SAVINGS or CURRENT. Only if the payout process needs it.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  accountType?: string;
}
