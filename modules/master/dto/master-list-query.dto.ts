import { IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { MasterListStatusFilter } from '../enums/master-list-status-filter.enum';

export class MasterListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterListStatusFilter)
  status?: MasterListStatusFilter;
}
