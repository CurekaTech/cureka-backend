import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsRefId } from '@common/validators/is-ref-id.decorator';
import { MasterStatus } from '../enums/master-status.enum';

const parseJsonArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    // Valid JSON array: ["a","b"]
    try {
      return JSON.parse(trimmed) as string[];
    } catch {
      // Bracket notation without quotes: [DIA123, LIT456]
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return trimmed
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      }
      // Single plain string
      return [trimmed];
    }
  }
  return undefined;
};

export class CreateManufacturerDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  landmark?: string;

  @IsOptional()
  @IsRefId()
  cityRefId?: string;

  @IsOptional()
  @IsRefId()
  stateRefId?: string;

  @IsOptional()
  @IsRefId()
  countryRefId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pinCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  gstNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  drugLicenseNumber?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  categoryRefIds?: string[];
}

export class UpdateManufacturerDto extends PartialType(CreateManufacturerDto) {}

export class UpdateManufacturerStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
