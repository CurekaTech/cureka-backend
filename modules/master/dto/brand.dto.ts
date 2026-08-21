import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';

const parseJsonArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') return JSON.parse(value) as string[];
  return undefined;
};

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

/** Multipart may send brandHighlights as a JSON string; null clears the field. */
const parseBrandHighlights = ({
  value,
}: {
  value: unknown;
}): BrandHighlightDto[] | null | undefined => {
  if (value === undefined || value === '') return undefined;
  if (value === null || value === 'null') return null;
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null) return null;
    if (!Array.isArray(parsed)) {
      throw new Error('brandHighlights must be a JSON array or null');
    }
    return parsed as BrandHighlightDto[];
  }
  if (Array.isArray(value)) return value as BrandHighlightDto[];
  return undefined;
};

export class BrandHighlightDto {
  /**
   * Optional icon. Accepts a storage path string, `{ key, name }`, or null.
   * File field uploads for highlight icons are not supported in multipart;
   * upload via gallery/uploads first, then pass the path/reference here.
   */
  @IsOptional()
  icon?: string | { key: string; name: string } | null;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  subtitle!: string;
}

export class CreateBrandDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  inHomePage?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  metaKeywords?: string[];

  @IsOptional()
  @Transform(parseBrandHighlights)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => BrandHighlightDto)
  brandHighlights?: BrandHighlightDto[] | null;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class UpdateBrandStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
