import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class BobUpdateProductTagsDto {
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}

export class BobCreateOrderVariantDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  price?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class BobCreateOrderCartItemDto {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @ValidateNested()
  @Type(() => BobCreateOrderVariantDto)
  variant!: BobCreateOrderVariantDto;
}

export class BobCreateOrderAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  zip?: string;
}

export class BobCreateOrderDiscountDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  valueType?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class BobCreateOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @IsNotEmpty()
  @IsString()
  customerPhone!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && !value.trim() ? undefined : value))
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsIn(['COD', 'ONLINE', 'cod', 'online'])
  paymentType?: string;

  @IsOptional()
  @IsString()
  total_amount?: string;

  @IsOptional()
  @IsString()
  shipping_amount?: string;

  @IsOptional()
  @IsString()
  tax_amount?: string;

  @IsOptional()
  @IsString()
  discount_amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BobCreateOrderCartItemDto)
  cart!: BobCreateOrderCartItemDto[];

  @ValidateNested()
  @Type(() => BobCreateOrderAddressDto)
  shippingAddress!: BobCreateOrderAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => BobCreateOrderDiscountDto)
  discount?: BobCreateOrderDiscountDto;
}

export class BobPlaceOrderDto {
  @IsOptional()
  @IsString()
  OrderId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsBoolean()
  paymentPending?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  paymentId?: string;
}

export class BobCancelOrderDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cancelledBy?: string;
}
