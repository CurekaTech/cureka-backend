import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';

export const DASHBOARD_PERIODS = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn([...DASHBOARD_PERIODS])
  period?: DashboardPeriod;

  /** Filter by order channel. Accepts: all | Web | Website | Android App | iOS App | App | Admin | GoKwik */
  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(['revenue', 'orders'])
  sortBy?: 'revenue' | 'orders';
}

/** Filters + pagination for dashboard "View All" screens. */
export class DashboardViewAllQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsIn([...DASHBOARD_PERIODS])
  period?: DashboardPeriod;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsIn(['revenue', 'orders'])
  sortBy?: 'revenue' | 'orders';
}
