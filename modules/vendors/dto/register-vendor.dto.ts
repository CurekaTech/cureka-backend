import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import {
  INDIAN_MOBILE_REGEX,
  INDIAN_MOBILE_VALIDATION_MESSAGE,
  normalizeMobileNumber,
} from '@modules/auth/utils/mobile-number.util';
import { VENDOR_LIST_SORT_FIELDS } from '../constants/vendor-list.constants';
import { VendorStatus } from '../enums/vendor-status.enum';

const normalizeMobileField = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizeMobileNumber(value) : value;

const normalizeUpperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

/** Indian PAN: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F). */
export const INDIAN_PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Indian GSTIN: 15 chars (state + PAN + entity + Z + checksum). */
export const INDIAN_GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export class StorageFileReferenceDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(1024)
  key!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;
}

export class RegisterVendorDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  companyName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  contactPerson!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @Transform(normalizeMobileField)
  @IsNotEmpty({ message: 'Mobile number is required.' })
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  mobileNumber!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  businessAddress!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  warehouseAddress!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  warehousePincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  warehouseContactPerson?: string;

  @IsOptional()
  @Transform(normalizeMobileField)
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  warehouseContactPhone?: string;

  @Transform(normalizeUpperTrim)
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  @Matches(INDIAN_PAN_REGEX, { message: 'Please enter a valid PAN (e.g. ABCDE1234F).' })
  panNumber!: string;

  /** Optional JSON-only; prefer uploading `panDocument` as a multipart file field. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorageFileReferenceDto)
  panDocument?: StorageFileReferenceDto;

  @Transform(normalizeUpperTrim)
  @IsNotEmpty()
  @IsString()
  @MinLength(15)
  @MaxLength(15)
  @Matches(INDIAN_GSTIN_REGEX, { message: 'Please enter a valid 15-character GSTIN.' })
  gstNumber!: string;

  /** Optional JSON-only; prefer uploading `gstCertificateDocument` as a multipart file field. */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorageFileReferenceDto)
  gstCertificateDocument?: StorageFileReferenceDto;

  /**
   * Optional JSON-only; prefer uploading `productExcelSheet` as a multipart file field.
   * Sheet contents are not validated — file is stored for later manual review.
   */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorageFileReferenceDto)
  productExcelSheet?: StorageFileReferenceDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  productCategories?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  brandDetails?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  companyProfile?: string;
}

/** Admin edit — all fields optional; omit files to keep existing documents. */
export class UpdateVendorDto extends PartialType(RegisterVendorDto) {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(VendorStatus)
  status?: VendorStatus;
}

/**
 * Admin vendor list filters.
 * sortBy: createdAt | updatedAt | companyName | contactPerson | email | mobileNumber |
 *         status | source | gstNumber | panNumber | warehousePincode | refId
 */
export class VendorListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @IsString()
  @IsIn([...VENDOR_LIST_SORT_FIELDS])
  declare sortBy?: string;
}
