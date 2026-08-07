import { PartialType } from '@nestjs/mapped-types';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsRefId, PaginationQueryDto } from '@packages/common';
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

/** Parse JSON string form fields (multipart) into objects/arrays. */
export const parseJsonField = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Multipart sends nested arrays as JSON strings. Parse then instantiate nested DTOs
 * so `@ValidateNested` receives class instances (plain objects cause
 * `*.undefined: an unknown value was passed to the validate function`).
 */
const parseJsonArrayOf =
  <T>(cls: new () => T) =>
  ({ value }: { value: unknown }): T[] | unknown => {
    const parsed = parseJsonField({ value });
    if (parsed === undefined) return undefined;
    if (!Array.isArray(parsed)) return parsed;
    return plainToInstance(cls, parsed);
  };

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

export class VendorCategoryHierarchyDto {
  @IsNotEmpty()
  @IsRefId()
  categoryRefId!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsRefId()
  subCategoryRefId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsRefId()
  subSubCategoryRefId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined && value !== '')
  @IsRefId()
  subSubSubCategoryRefId?: string | null;
}

export class VendorWarehouseDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  address!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  pincode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactPerson?: string;

  @IsOptional()
  @Transform(normalizeMobileField)
  @IsString()
  @Matches(INDIAN_MOBILE_REGEX, { message: INDIAN_MOBILE_VALIDATION_MESSAGE })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  warehouseCode?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
  })
  @IsBoolean()
  isDefault?: boolean;
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

  @Transform(normalizeUpperTrim)
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(10)
  @Matches(INDIAN_PAN_REGEX, { message: 'Please enter a valid PAN (e.g. ABCDE1234F).' })
  panNumber!: string;

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

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorageFileReferenceDto)
  gstCertificateDocument?: StorageFileReferenceDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => StorageFileReferenceDto)
  productExcelSheet?: StorageFileReferenceDto;

  @Transform(parseJsonArrayOf(VendorCategoryHierarchyDto))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorCategoryHierarchyDto)
  categories!: VendorCategoryHierarchyDto[];

  @Transform(parseJsonField)
  @IsArray()
  @ArrayMinSize(1)
  @IsRefId({ each: true })
  brandRefIds!: string[];

  @Transform(parseJsonArrayOf(VendorWarehouseDto))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorWarehouseDto)
  warehouses!: VendorWarehouseDto[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  companyProfile?: string;
}

/** Admin edit — all fields optional; omit files/arrays to keep existing values. */
export class UpdateVendorDto extends PartialType(RegisterVendorDto) {
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(VendorStatus)
  status?: VendorStatus;

  @IsOptional()
  @Transform(parseJsonArrayOf(VendorCategoryHierarchyDto))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorCategoryHierarchyDto)
  declare categories?: VendorCategoryHierarchyDto[];

  @IsOptional()
  @Transform(parseJsonField)
  @IsArray()
  @ArrayMinSize(1)
  @IsRefId({ each: true })
  declare brandRefIds?: string[];

  @IsOptional()
  @Transform(parseJsonArrayOf(VendorWarehouseDto))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorWarehouseDto)
  declare warehouses?: VendorWarehouseDto[];
}

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
