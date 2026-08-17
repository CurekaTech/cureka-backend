import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ProductSubscriptionFrequency } from '@modules/subscription/enums/product-subscription-frequency.enum';

export class AddCartItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId!: string;

  @IsNotEmpty()
  @IsUUID()
  variantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsBoolean()
  isSubscription?: boolean;

  @ValidateIf((o: AddCartItemDto) => !!o.isSubscription)
  @IsEnum(ProductSubscriptionFrequency)
  frequency?: ProductSubscriptionFrequency;
}

export class UpdateCartItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class MergeGuestCartDto {
  @IsNotEmpty()
  @IsUUID()
  guestUserId!: string;
}

export class ApplyCouponDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  couponCode!: string;
}
