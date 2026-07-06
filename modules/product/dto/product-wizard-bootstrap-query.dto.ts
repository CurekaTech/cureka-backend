import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { IsRefId } from '@packages/common';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { MasterListStatusFilter } from '@modules/master/enums/master-list-status-filter.enum';

export class ProductWizardBootstrapQueryDto {
  @IsOptional()
  @IsEnum(MasterListStatusFilter)
  status?: MasterListStatusFilter;

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
