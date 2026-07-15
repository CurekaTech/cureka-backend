import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';

const CUSTOM_TYPE_VALUES = [
  HomeSectionType.BANNER,
  HomeSectionType.PRODUCT_SLIDER,
  HomeSectionType.CATEGORY_SLIDER,
] as const;

function parseJsonArray(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed;
  } catch {
    return trimmed.includes(',')
      ? trimmed.split(',').map((part) => part.trim()).filter(Boolean)
      : [trimmed];
  }
}

export class CreateHomeSectionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsIn(CUSTOM_TYPE_VALUES)
  type!: (typeof CUSTOM_TYPE_VALUES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl?: string;

  /** Optional second CTA when `bannerVariant` is `brand`. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl2?: string;

  /** `festive` = full-width promo; `brand` = side-by-side brand cards. */
  @IsOptional()
  @IsIn(['festive', 'brand'])
  bannerVariant?: 'festive' | 'brand';

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsRefId({ each: true })
  productRefIds?: string[];

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsRefId({ each: true })
  categoryRefIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  pageDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageCanonicalUrl?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateHomeSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl2?: string;

  @IsOptional()
  @IsIn(['festive', 'brand'])
  bannerVariant?: 'festive' | 'brand';

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsRefId({ each: true })
  productRefIds?: string[];

  @IsOptional()
  @Transform(({ value }) => parseJsonArray(value))
  @IsArray()
  @IsRefId({ each: true })
  categoryRefIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  pageTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  pageDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageCanonicalUrl?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateHomeSectionStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ReorderHomeSectionItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newIndex!: number;
}

export class ReorderHomeSectionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderHomeSectionItemDto)
  sections!: ReorderHomeSectionItemDto[];
}
