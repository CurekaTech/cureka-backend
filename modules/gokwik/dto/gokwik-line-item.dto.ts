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

  /**
   * GoKwik freebie / auto-add free product marker on place-order & create-order line_items.
   * Prefer this over source when GoKwik keeps source as the merchant id (e.g. "cureka").
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (value === true || value === 'true' || value === 1 || value === '1') return true;
    if (value === false || value === 'false' || value === 0 || value === '0') return false;
    return value;
  })
  @IsBoolean()
  is_freebie?: boolean;

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
