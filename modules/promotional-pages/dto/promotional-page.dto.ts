import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { REF_ID_PATTERN } from '@packages/common';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import {
  MAX_COLLECTION_LIMIT,
  SECTION_HEADING_MAX,
  SECTION_SUBTITLE_MAX,
  SECTION_TITLE_MAX,
} from '../utils/promotional-page-content.util';

export class PromotionalStorageRefDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}

export class PromotionalSectionConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(SECTION_HEADING_MAX)
  heading?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionalStorageRefDto)
  desktopImage?: PromotionalStorageRefDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionalStorageRefDto)
  mobileImage?: PromotionalStorageRefDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionalStorageRefDto)
  thumbnail?: PromotionalStorageRefDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ctaText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ctaUrl?: string | null;

  @IsOptional()
  @IsIn(['manual', 'brand', 'category'])
  selectionMode?: 'manual' | 'brand' | 'category';

  @IsOptional()
  @Matches(REF_ID_PATTERN, { message: 'brandRefId must be a reference id' })
  brandRefId?: string | null;

  @IsOptional()
  @Matches(REF_ID_PATTERN, { message: 'categoryRefId must be a reference id' })
  categoryRefId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_COLLECTION_LIMIT)
  maxItems?: number | null;

  @IsOptional()
  @IsIn(['carousel', 'grid'])
  layout?: 'carousel' | 'grid' | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  videoUrl?: string | null;

  @IsOptional()
  @IsIn(['selected', 'featured', 'trending'])
  blogMode?: 'selected' | 'featured' | 'trending';
}

export class PromotionalSectionItemDto {
  @IsEnum(PromotionalTargetType)
  targetType!: PromotionalTargetType;

  @IsString()
  @Matches(REF_ID_PATTERN, { message: 'targetRefId must be a reference id' })
  targetRefId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class PromotionalSectionDto {
  @IsEnum(PromotionalSectionType)
  type!: PromotionalSectionType;

  @IsOptional()
  @IsString()
  @MaxLength(SECTION_TITLE_MAX)
  title?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(SECTION_SUBTITLE_MAX)
  subtitle?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PromotionalSectionConfigDto)
  config?: PromotionalSectionConfigDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PromotionalSectionItemDto)
  items?: PromotionalSectionItemDto[];
}

export class PromotionalPageTargetDto {
  @IsEnum(PromotionalTargetType)
  targetType!: PromotionalTargetType;

  @IsString()
  @Matches(REF_ID_PATTERN, { message: 'targetRefId must be a reference id' })
  targetRefId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreatePromotionalPageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(280)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase kebab-case (e.g. himalaya-buy-more-save-more)',
  })
  slug!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  metaTitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  metaDescription?: string | null;

  @IsOptional()
  @IsEnum(PromotionalPageStatus)
  status?: PromotionalPageStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  startAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endAt?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(REF_ID_PATTERN, { message: 'couponRefId must be a reference id' })
  couponRefId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionalSectionDto)
  sections?: PromotionalSectionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PromotionalPageTargetDto)
  targets?: PromotionalPageTargetDto[];
}

export class UpdatePromotionalPageDto extends PartialType(CreatePromotionalPageDto) {}

export class UpdatePromotionalPageStatusDto {
  @IsEnum(PromotionalPageStatus)
  status!: PromotionalPageStatus;
}

export class ReplacePromotionalSectionsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionalSectionDto)
  sections!: PromotionalSectionDto[];
}

export class PromotionalSectionSequenceItemDto {
  @IsUUID()
  sectionId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class UpdatePromotionalSectionSequenceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PromotionalSectionSequenceItemDto)
  sections!: PromotionalSectionSequenceItemDto[];
}

export class PromotionalPageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PromotionalPageStatus)
  status?: PromotionalPageStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
