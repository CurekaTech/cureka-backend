import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDecimal,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { PaymentRequestStatus } from '../enums/payment-request-status.enum';
import { AdminPaymentMethod } from '../enums/admin-payment-method.enum';

export class PaymentRequestItemInputDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsDecimal()
  unitPrice!: string;

  @IsOptional()
  @IsDecimal()
  discount?: string;

  @IsOptional()
  @IsDecimal()
  tax?: string;
}

export class CreatePaymentRequestDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  addressId?: string;

  /** `COD` places a real order immediately (no payment link). `PREPAID` (default) waits for Razorpay. */
  @IsOptional()
  @IsIn([AdminPaymentMethod.COD, AdminPaymentMethod.PREPAID])
  paymentMethod?: AdminPaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsString()
  @MaxLength(20)
  customerPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  customerEmail?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentRequestItemInputDto)
  items!: PaymentRequestItemInputDto[];

  @IsOptional()
  @IsDecimal()
  discount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  couponCode?: string;

  @IsOptional()
  @IsDecimal()
  tax?: string;

  @IsOptional()
  @IsDecimal()
  shipping?: string;

  @IsOptional()
  @IsDecimal()
  handling?: string;

  @IsOptional()
  @IsDecimal()
  finalAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  shippingPhoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  shippingRecipientName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  shippingPincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingAddressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingAddressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  shippingLandmark?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdatePaymentRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentRequestItemInputDto)
  items!: PaymentRequestItemInputDto[];

  @IsOptional()
  @IsDecimal()
  discount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  couponCode?: string;

  @IsOptional()
  @IsDecimal()
  tax?: string;

  @IsOptional()
  @IsDecimal()
  shipping?: string;

  @IsOptional()
  @IsDecimal()
  handling?: string;

  @IsOptional()
  @IsDecimal()
  finalAmount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}


export class PaymentRequestQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(PaymentRequestStatus)
  status?: PaymentRequestStatus;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  /**
   * Free-text search across: Order ID (refId), Customer Name (firstName/lastName/email/phone),
   * Product Name, Payment Amount, Razorpay reference.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class GenerateLinkPrefillDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsString()
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? undefined : value))
  @IsEmail()
  email?: string;
}

export class ValidateAdminCouponDto {
  @IsString()
  @MaxLength(100)
  couponCode!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsIn([AdminPaymentMethod.COD, AdminPaymentMethod.PREPAID])
  paymentMethod?: AdminPaymentMethod;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentRequestItemInputDto)
  items!: PaymentRequestItemInputDto[];
}


