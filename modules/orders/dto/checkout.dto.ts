import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';

export class CheckoutDto {
  @IsNotEmpty()
  @IsUUID()
  addressId!: string;

  /**
   * Optional fee hint only (COD charge / prepaid discount in the summary).
   * Does not start Razorpay/Cashfree/GoKwik. To open GoKwik, call POST /payment-requests/checkout
   * when admin setting `gokwikCheckoutEnabled` is active — do not send `GOKWIK_*` here.
   */
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  /** Where the order is being placed from. Defaults to Website. */
  @IsOptional()
  @IsEnum(OrderSource)
  @IsIn([OrderSource.WEBSITE, OrderSource.APP])
  orderSource?: OrderSource;
}
