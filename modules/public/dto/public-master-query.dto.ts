import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsRefId } from '@packages/common';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { PublicMasterType } from '../enums/public-master-type.enum';

export class PublicMasterQueryDto {
  @IsEnum(PublicMasterType)
  type!: PublicMasterType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  })
  @IsEnum(CategoryHierarchyLevel)
  categoryHierarchyLevel?: CategoryHierarchyLevel;

  @IsOptional()
  @IsRefId()
  parentCategoryRefId?: string;
}
