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
  address?: string;

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
