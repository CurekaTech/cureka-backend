import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GokwikLineItemDiscountDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  discount_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class GokwikLineItemDto {
  @IsUUID()
  product_id!: string;

  @IsUUID()
  variant_id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  mrp?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  @MaxLength(200)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsBoolean()
  discounted_item?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GokwikLineItemDiscountDto)
  discounts?: GokwikLineItemDiscountDto[];
}
