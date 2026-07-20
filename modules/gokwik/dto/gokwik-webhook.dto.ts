import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class GokwikTransactionWebhookDataDto {
  @IsNotEmpty() @IsString() hmac!: string;
  @IsNotEmpty() @IsString() paymentId!: string;
  @IsNotEmpty() @IsString() merchantId!: string;
  @IsNotEmpty() @IsString() merchantReferenceId!: string;
  @IsNotEmpty() @IsString() currency!: string;
  @IsNotEmpty() @IsString() method!: string;
  @IsNotEmpty() @IsString() provider!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsBoolean() rewardTransaction!: boolean;
  @IsOptional() @IsString() gatewayReferenceId?: string;
  @IsOptional() @IsString() customerReferenceId?: string;
  @IsOptional() @IsString() description?: string;
}

export class GokwikTransactionWebhookDto {
  @IsIn(['transaction.successful', 'transaction.failure', 'transaction.auto_refund'])
  event!: string;

  @IsIn(['transaction'])
  entity!: 'transaction';

  @IsDefined()
  @ValidateNested()
  @Type(() => GokwikTransactionWebhookDataDto)
  data!: GokwikTransactionWebhookDataDto;
}

export class GokwikRefundWebhookDataDto {
  @IsNotEmpty() @IsString() hmac!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsBoolean() auto!: boolean;
  @IsNotEmpty() @IsString() merchantId!: string;
  @IsNotEmpty() @IsString() merchantReferenceId!: string;
  @IsNotEmpty() @IsString() paymentId!: string;
  @IsNotEmpty() @IsString() provider!: string;
  @IsNotEmpty() @IsString() refundId!: string;
  @IsNotEmpty() @IsString() transactionPaymentId!: string;
  @IsBoolean() rewardRefund!: boolean;
  @IsNotEmpty() @IsString() refundRequestDescription!: string;
  @IsOptional() @IsString() customerReferenceId?: string;
  @IsOptional() @IsString() gatewayReferenceId?: string;
}

export class GokwikRefundWebhookDto {
  @IsIn(['refund.successful', 'refund.failure', 'refund.pending', 'refund.initiated'])
  event!: string;

  @IsIn(['refund'])
  entity!: 'refund';

  @IsDefined()
  @ValidateNested()
  @Type(() => GokwikRefundWebhookDataDto)
  data!: GokwikRefundWebhookDataDto;
}

export class GokwikAbandonedCartItemDto {
  @IsNotEmpty()
  @IsString()
  cart_id!: string;

  @IsOptional()
  @IsString()
  merchant_cart_id?: string;

  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class GokwikAbandonedCartWebhookDto {
  @IsOptional()
  @IsString()
  request_id?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GokwikAbandonedCartItemDto)
  carts!: GokwikAbandonedCartItemDto[];
}

export class GokwikRefundInitiationDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
