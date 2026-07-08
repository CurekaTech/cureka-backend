import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';

export class CheckoutDto {
  @IsNotEmpty()
  @IsUUID()
  addressId!: string;

  /** When set, payment-method-specific fees (COD charge, prepaid discount) are included in the summary. */
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;
}
