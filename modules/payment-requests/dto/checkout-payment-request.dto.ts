import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

/**
 * Storefront checkout / checkout-modal body.
 * `addressId` is optional for GoKwik address-less open; enforced in service for
 * Shiprocket and legacy native PG.
 */
export class CheckoutPaymentRequestDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional for GoKwik. Required for Shiprocket and Razorpay/Cashfree checkout.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    enum: OrderPaymentMethod,
    description:
      'Optional. For legacy PG applies prepaid pricing (RAZORPAY/CASHFREE). ' +
      'For GoKwik omit or use GOKWIK_PREPAID — does not select Razorpay gateway.',
  })
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @ApiPropertyOptional({ enum: [OrderSource.WEBSITE, OrderSource.APP] })
  @IsOptional()
  @IsEnum(OrderSource)
  @IsIn([OrderSource.WEBSITE, OrderSource.APP])
  orderSource?: OrderSource;
}
