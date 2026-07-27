import { Transform } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

export class GokwikCheckOrderExistsDto {
  /** Same as merchantCheckoutId / cart_id (CartEntity.id). */
  @Transform(({ value }) => (value == null ? '' : String(value).trim()))
  session_key!: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  customer_email?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  customer_phone?: string;

  /** GoKwik may send these aliases alongside customer_* fields. */
  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  user_email?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  user_phone?: string;
}
