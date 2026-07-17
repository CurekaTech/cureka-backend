import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class GokwikCheckOrderExistsDto {
  /** Same as merchantCheckoutId / cart_id (CartEntity.id). */
  @IsNotEmpty()
  @IsString()
  session_key!: string;

  @IsOptional()
  @IsEmail()
  customer_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customer_phone?: string;
}
