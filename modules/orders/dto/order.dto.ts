import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderPaymentStatus } from '../enums/order-payment-status.enum';
import { OrderSource } from '../enums/order-source.enum';
import { OrderStatus } from '../enums/order-status.enum';

export const ADMIN_ORDER_LIST_SORT_FIELDS = [
  'createdAt',
  'placedAt',
  'orderNumber',
  'grandTotal',
  'orderStatus',
  'paymentStatus',
  'recipientName',
] as const;

export type AdminOrderListSortField = (typeof ADMIN_ORDER_LIST_SORT_FIELDS)[number];

export class PlaceOrderDto {
  @IsUUID()
  addressId!: string;

  @IsEnum(OrderPaymentMethod)
  paymentMethod!: OrderPaymentMethod;

  @IsOptional()
  @IsEnum(OrderSource)
  @IsIn([OrderSource.WEBSITE, OrderSource.APP])
  orderSource?: OrderSource;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class OrderQueryDto {
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
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class AdminOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  orderStatus?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @IsOptional()
  @IsEnum(OrderSource)
  orderSource?: OrderSource;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsIn([...ADMIN_ORDER_LIST_SORT_FIELDS])
  sortBy?: AdminOrderListSortField;
}

export class CancelOrderDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
