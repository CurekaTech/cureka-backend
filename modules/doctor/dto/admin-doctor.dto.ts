import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { DoctorCategory } from '../enums/doctor-category.enum';
import { DoctorPricingType } from '../enums/doctor-pricing-type.enum';
import { DoctorStatus } from '../enums/doctor-status.enum';

export class DoctorBankDetailsDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  accountHolderName!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(30)
  accountNumber!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  ifscCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  bankName?: string;
}

export class DoctorClinicDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  city!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  state!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  pincode!: string;

  @IsOptional()
  @IsString()
  latitude?: string;

  @IsOptional()
  @IsString()
  longitude?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateDoctorDto {
  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  fullName!: string;

  @IsEnum(DoctorCategory)
  category!: DoctorCategory;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsArray()
  @IsString({ each: true })
  qualificationRefIds!: string[];

  @IsArray()
  @IsString({ each: true })
  specializationRefIds!: string[];

  @IsArray()
  @IsString({ each: true })
  languageRefIds!: string[];

  @ValidateNested({ each: true })
  @Type(() => DoctorClinicDto)
  @ArrayMinSize(1)
  clinics!: DoctorClinicDto[];

  @IsEnum(DoctorPricingType)
  pricingType!: DoctorPricingType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ValidateNested()
  @Type(() => DoctorBankDetailsDto)
  bankDetails!: DoctorBankDetailsDto;
}

export class UpdateDoctorDto implements Partial<CreateDoctorDto> {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsEnum(DoctorCategory)
  category?: DoctorCategory;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  qualificationRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializationRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languageRefIds?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DoctorClinicDto)
  clinics?: DoctorClinicDto[];

  @IsOptional()
  @IsEnum(DoctorPricingType)
  pricingType?: DoctorPricingType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DoctorBankDetailsDto)
  bankDetails?: DoctorBankDetailsDto;
}

export class RejectDoctorDto {
  @IsNotEmpty()
  @IsString()
  rejectionReason!: string;
}

export class UpdateDoctorActiveStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class DoctorListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DoctorStatus)
  status?: DoctorStatus;

  @IsOptional()
  @IsEnum(DoctorCategory)
  category?: DoctorCategory;

  @IsOptional()
  @IsBoolean()
  isBookable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
