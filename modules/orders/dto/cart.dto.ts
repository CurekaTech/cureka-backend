import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min } from 'class-validator';

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
