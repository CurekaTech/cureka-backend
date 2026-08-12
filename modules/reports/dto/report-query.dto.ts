import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsRefId, PaginationQueryDto } from '@packages/common';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';

export class ReportQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsRefId()
  categoryRefId?: string;

  @IsOptional()
  @IsRefId()
  brandRefId?: string;

  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsIn(['product', 'consultation'])
  type?: 'product' | 'consultation';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @IsIn(['date', 'orders', 'grossSales', 'netSales', 'aov'])
  sortBy?: 'date' | 'orders' | 'grossSales' | 'netSales' | 'aov';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  /** Product performance: `best` (default) or `low` selling in the selected period. */
  @IsOptional()
  @IsIn(['best', 'low'])
  ranking?: 'best' | 'low';

  /** Inventory report stock filter. */
  @IsOptional()
  @IsIn(['all', 'low', 'out_of_stock', 'in_stock'])
  stockFilter?: 'all' | 'low' | 'out_of_stock' | 'in_stock';

  @IsOptional()
  @IsRefId()
  vendorRefId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}

