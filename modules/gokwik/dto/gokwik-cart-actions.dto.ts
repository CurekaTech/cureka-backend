import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export class GokwikShippingAddressDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/)
  postal_code!: string;

  @IsNotEmpty()
  @IsString()
  city!: string;

  @IsNotEmpty()
  @IsString()
  state!: string;

  @IsNotEmpty()
  @IsString()
  first_name!: string;

  @IsNotEmpty()
  @IsString()
  last_name!: string;

  @IsNotEmpty()
  @IsString()
  address!: string;

  @IsEmail()
  email!: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/)
  phone!: string;
}

export class GokwikSetShippingAddressDto {
  @IsNotEmpty()
  @IsString()
  cart_id!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => GokwikShippingAddressDto)
  shipping_address!: GokwikShippingAddressDto;
}

export class GokwikDiscountDto {
  @IsNotEmpty()
  @IsString()
  cart_id!: string;

  @IsNotEmpty()
  @IsString()
  discount_code!: string;
}
