import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  Max,
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

export const USER_ORDER_LIST_SORT_FIELDS = [
  'createdAt',
  'placedAt',
  'orderNumber',
  'grandTotal',
  'orderStatus',
  'paymentStatus',
] as const;

export type UserOrderListSortField = (typeof USER_ORDER_LIST_SORT_FIELDS)[number];

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
  @Max(100)
  limit?: number = 20;

  /** Filter by fulfillment status (legacy query name). */
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  /**
   * Search across order number, refId, recipient name, phone, product name, and grand total.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn([...USER_ORDER_LIST_SORT_FIELDS])
  sortBy?: UserOrderListSortField;

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class AdminOrderHistoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['CANCELLATION', 'RETURN'])
  requestType?: 'CANCELLATION' | 'RETURN';

  @IsOptional()
  @IsString()
  @MaxLength(40)
  workflowStatus?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  pendingExternalSync?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  requiresAttention?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  unverifiedOnly?: boolean;
}
