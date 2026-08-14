import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';
import { ProductSubscriptionFrequency } from '../enums/product-subscription-frequency.enum';
import { SubscriptionDiscountType } from '../enums/subscription-discount-type.enum';
import { SubscriptionMissedPaymentAction } from '../enums/subscription-missed-payment-action.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

export class ProductSubscriptionConfigDto {
  @ApiPropertyOptional({ description: 'Variant-specific config; omit/null for product-level' })
  @IsOptional()
  @IsUUID()
  productVariantId?: string | null;

  @ApiProperty({ default: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({ enum: ProductSubscriptionFrequency, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ProductSubscriptionFrequency, { each: true })
  frequencies!: ProductSubscriptionFrequency[];

  @ApiProperty({ enum: SubscriptionDiscountType })
  @IsEnum(SubscriptionDiscountType)
  discountType!: SubscriptionDiscountType;

  @ApiProperty({ example: 10 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  minDurationMonths?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDurationMonths?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  pauseAllowed?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  frequencyChangeAllowed?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  cancellationAllowed?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  skipAllowed?: boolean;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ enum: SubscriptionMissedPaymentAction })
  @IsOptional()
  @IsEnum(SubscriptionMissedPaymentAction)
  missedPaymentAction?: SubscriptionMissedPaymentAction;

  @ApiPropertyOptional({ enum: SubscriptionRenewalMethod })
  @IsOptional()
  @IsEnum(SubscriptionRenewalMethod)
  renewalMethod?: SubscriptionRenewalMethod;

  @ApiPropertyOptional({ type: [Number], example: [7, 2, 0] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  reminderOffsetsJson?: number[];
}
