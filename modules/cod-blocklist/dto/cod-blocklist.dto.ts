import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { CodBlocklistType } from '../enums/cod-blocklist-type.enum';
import { INDIAN_PINCODE_REGEX, INDIAN_PINCODE_VALIDATION_MESSAGE } from '../utils/pincode.util';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

export class CreateCodBlocklistEntryDto {
  @ApiProperty({ enum: CodBlocklistType })
  @IsEnum(CodBlocklistType)
  type!: CodBlocklistType;

  @ApiPropertyOptional({ example: '380015' })
  @ValidateIf((dto: CreateCodBlocklistEntryDto) => dto.type === CodBlocklistType.PINCODE)
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @Matches(INDIAN_PINCODE_REGEX, { message: INDIAN_PINCODE_VALIDATION_MESSAGE })
  pincode?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(
    (dto: CreateCodBlocklistEntryDto) =>
      dto.type === CodBlocklistType.CUSTOMER && !dto.mobileNumber,
  )
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @ValidateIf(
    (dto: CreateCodBlocklistEntryDto) =>
      dto.type === CodBlocklistType.CUSTOMER && !dto.customerId,
  )
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCodBlocklistEntryDto extends PartialType(CreateCodBlocklistEntryDto) {
  @ApiPropertyOptional({
    enum: CodBlocklistType,
    description: 'Type cannot be changed after creation',
  })
  @IsOptional()
  @IsEnum(CodBlocklistType)
  override type?: CodBlocklistType;
}

export class CodBlocklistListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CodBlocklistType })
  @IsOptional()
  @IsEnum(CodBlocklistType)
  type?: CodBlocklistType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ['createdAt', 'updatedAt', 'type', 'pincode', 'mobileNumber', 'isActive'],
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'type', 'pincode', 'mobileNumber', 'isActive'])
  override sortBy?: string;
}

export class SearchCodBlocklistCustomersDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Name or mobile. Minimum 2 characters.' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  override search!: string;
}

export const PINCODE_PATTERN = INDIAN_PINCODE_REGEX;
export const PINCODE_MESSAGE = INDIAN_PINCODE_VALIDATION_MESSAGE;
