import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';

export const ADMIN_ABANDONED_CART_SORT_FIELDS = [
  'lastActivityAt',
  'totalAmount',
  'customerName',
  'mobileNumber',
  'createdAt',
] as const;

export type AdminAbandonedCartSortField = (typeof ADMIN_ABANDONED_CART_SORT_FIELDS)[number];

export class AdminAbandonedCartQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsIn([...ADMIN_ABANDONED_CART_SORT_FIELDS])
  sortBy?: AdminAbandonedCartSortField;
}
