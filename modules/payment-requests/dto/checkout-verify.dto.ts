import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CheckoutVerifyPaymentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  razorpay_order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  razorpay_payment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  razorpay_signature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cf_order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  cf_payment_id?: string;
}
