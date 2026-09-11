import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { OrderPaymentMethod } from '../enums/order-payment-method.enum';
import { OrderSource } from '../enums/order-source.enum';
import { normalizeStorefrontOrderSource } from '../utils/storefront-order-source.util';

const emptyToUndefined = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }
  return value;
};

const toStorefrontOrderSource = ({
  value,
  obj,
}: {
  value: unknown;
  obj: Record<string, unknown>;
}) => normalizeStorefrontOrderSource(value ?? obj?.order_source);

export class CheckoutDto {
  /**
   * Optional for GoKwik address-less start.
   * Required for Shiprocket / legacy (Razorpay/Cashfree) and COD place-order.
   * Empty string / null are treated as omitted.
   */
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional when checkout provider is GoKwik. Required for Shiprocket and native PG.',
  })
  @IsOptional()
  @Transform(emptyToUndefined)
  @IsUUID()
  addressId?: string;

  /**
   * Drives COD fee / prepaid % discount in the summary, and COD min/max eligibility.
   * Does not start Razorpay/Cashfree/GoKwik. To open GoKwik, call POST /payment-requests/checkout
   * when admin setting `gokwikCheckoutEnabled` is active — do not send `GOKWIK_*` here.
   */
  @ApiPropertyOptional({ enum: OrderPaymentMethod })
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  /** Where the order is being placed from. Sticky on the cart; defaults to Website. */
  @ApiPropertyOptional({ enum: [OrderSource.WEBSITE, OrderSource.APP] })
  @IsOptional()
  @Transform(toStorefrontOrderSource)
  @IsEnum(OrderSource)
  @IsIn([OrderSource.WEBSITE, OrderSource.APP])
  orderSource?: OrderSource;
}
