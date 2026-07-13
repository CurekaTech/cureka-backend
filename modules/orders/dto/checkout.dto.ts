import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';

export class CheckoutDto {
  @IsNotEmpty()
  @IsUUID()
  addressId!: string;

  /** When set, payment-method-specific fees (COD charge, prepaid discount) are included in the summary. */
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  /** Where the order is being placed from. Defaults to Website. */
  @IsOptional()
  @IsEnum(OrderSource)
  @IsIn([OrderSource.WEBSITE, OrderSource.APP])
  orderSource?: OrderSource;
}
