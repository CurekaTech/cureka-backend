import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterListQueryDto } from './master-list-query.dto';
import { CategoryHierarchyLevel } from '../enums/category-hierarchy-level.enum';
import { MasterStatus } from '../enums/master-status.enum';

const parseJsonArray = ({ value }: { value: unknown }): unknown[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return JSON.parse(value) as unknown[];
  return undefined;
};

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  aboveTheFold?: string;

  @IsOptional()
  @IsString()
  belowTheFold?: string;

  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  metaKeywords?: string[];

  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsRefId({ each: true })
  attributeRefIds?: string[];

  @IsOptional()
  @Transform(parseJsonArray)
  @IsArray()
  @IsRefId({ each: true })
  categoryFilterRefIds?: string[];

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isInHeader?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isInShopBy?: boolean;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class UpdateCategoryStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ReorderCategoryItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  position!: number;
}

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderCategoryItemDto)
  categories!: ReorderCategoryItemDto[];

  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;
}

export class CategoryPlacementQueryDto {
  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;
}

export class CategoryQueryDto extends MasterListQueryDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  })
  @IsEnum(CategoryHierarchyLevel)
  hierarchyLevel?: CategoryHierarchyLevel;

  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isInHeader?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isInShopBy?: boolean;
}
