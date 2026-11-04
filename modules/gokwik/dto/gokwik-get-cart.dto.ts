import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GokwikGetCartDto {
  /** Optional when the GoKwik checkout token already binds a cart. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  cart_id?: string;
}

export class GokwikGetCartQueryDto {
  @IsOptional()
  @IsString()
  cart_id?: string;

  @IsOptional()
  @IsString()
  cartId?: string;
}
