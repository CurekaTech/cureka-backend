import { PartialType } from '@nestjs/mapped-types';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export class CreatePackerDto {
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

  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(20)
  @Matches(/^\d+$/, { message: 'mobileNumber must contain digits only' })
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

  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @MaxLength(20)
  @Matches(/^\d+$/, { message: 'pinCode must contain digits only' })
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
  @IsString()
  remarks?: string;
}

export class UpdatePackerDto extends PartialType(CreatePackerDto) {}

export class UpdatePackerStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
