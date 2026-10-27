import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class GokwikApplyWalletCreditDto {
  @IsString()
  @MinLength(1)
  cart_id!: string;

  @IsOptional()
  @IsString()
  user_id?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  subtotal?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shipping_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shipping?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shipping_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  final_cart_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  final_total?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cart_total?: number;
}

export class GokwikRemoveWalletCreditDto {
  @IsString()
  @MinLength(1)
  cart_id!: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}
