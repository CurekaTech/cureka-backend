import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  Allow,
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

export class BrandHighlightIconDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}

/**
 * Normalize highlight icon from multipart JSON:
 * - null / "" / "null" → null
 * - storage path string → string
 * - { key, name } → BrandHighlightIconDto
 */
const parseHighlightIcon = ({ value }: { value: unknown }): string | BrandHighlightIconDto | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '' || value === 'null') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'null') return null;
    // JSON object sent as string
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return plainToInstance(BrandHighlightIconDto, parsed);
        }
      } catch {
        // treat as plain storage path
      }
    }
    return trimmed;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return plainToInstance(BrandHighlightIconDto, value);
  }
  return null;
};

export class BrandHighlightDto {
  /**
   * Optional icon. Accepts a storage path string, `{ key, name }`, or null.
   * Upload icons via gallery/uploads first, then pass the path/reference here.
   */
  @IsOptional()
  @Transform(parseHighlightIcon)
  @ValidateIf((_, value) => value !== null && value !== undefined && typeof value === 'object')
  @ValidateNested()
  @Type(() => BrandHighlightIconDto)
  @Allow()
  icon?: string | BrandHighlightIconDto | null;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  subtitle!: string;
}

/** Multipart may send brandHighlights as a JSON string; null clears the field. */
const parseBrandHighlights = ({
  value,
}: {
  value: unknown;
}): BrandHighlightDto[] | null | undefined => {
  if (value === undefined || value === '') return undefined;
  if (value === null || value === 'null') return null;

  let parsed: unknown = value;
  if (typeof value === 'string') {
    parsed = JSON.parse(value) as unknown;
  }
  if (parsed === null) return null;
  if (!Array.isArray(parsed)) {
    throw new Error('brandHighlights must be a JSON array or null');
  }

  return parsed.map((item) => plainToInstance(BrandHighlightDto, item));
};

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

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showVideo?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showFeaturedBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showPromotionalBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showSecondaryBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showSecondaryVideo?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showOfferBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showBrandHighlights?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  showDescription?: boolean;
}

/**
 * Explicitly re-declare brandHighlights so PartialType does not drop
 * nested @Type / @Transform metadata (causes validate "undefined" errors).
 */
export class UpdateBrandDto extends PartialType(CreateBrandDto) {
  @IsOptional()
  @Transform(parseBrandHighlights)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => BrandHighlightDto)
  brandHighlights?: BrandHighlightDto[] | null;
}

export class UpdateBrandStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
