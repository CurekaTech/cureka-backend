import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { IsRefId } from '@packages/common';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { MasterListStatusFilter } from '@modules/master/enums/master-list-status-filter.enum';
import { ProductWizardMasterType } from '../enums/product-wizard-master-type.enum';

export class ProductWizardBootstrapQueryDto {
  @IsEnum(ProductWizardMasterType)
  type!: ProductWizardMasterType;

  @IsOptional()
  @IsEnum(MasterListStatusFilter)
  status?: MasterListStatusFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cursor?: string;

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
