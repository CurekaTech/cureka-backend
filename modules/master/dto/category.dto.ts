import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
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
  metaDescription?: string;

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

export class CategoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(CategoryHierarchyLevel)
  @Type(() => Number)
  hierarchyLevel?: CategoryHierarchyLevel;

  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;
}
