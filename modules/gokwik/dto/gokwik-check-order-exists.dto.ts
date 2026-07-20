import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class GokwikCheckOrderExistsDto {
  /** Same as merchantCheckoutId / cart_id (CartEntity.id). */
  @IsNotEmpty()
  @IsString()
  session_key!: string;

  @IsEmail()
  customer_email!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  @MaxLength(20)
  customer_phone!: string;
}
