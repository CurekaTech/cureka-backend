import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  GokwikAddressDto,
  GokwikCreateOrderMetaDataDto,
  GokwikPaymentDetailsDto,
} from './gokwik-create-order.dto';

export class GokwikUserDetailsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  age?: number;

  @IsOptional()
  @IsString()
  pan?: string;

  @IsOptional()
  @IsString()
  gst_no?: string;

  @IsOptional()
  @IsString()
  tnc?: string;
}

export class GokwikUtmDetailsDto {
  @IsOptional()
  @IsString()
  ad_source?: string;

  @IsOptional()
  @IsString()
  utm_source?: string;

  @IsOptional()
  @IsString()
  utm_medium?: string;

  @IsOptional()
  @IsString()
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  utm_term?: string;

  @IsOptional()
  @IsString()
  utm_content?: string;
}

export class GokwikPlaceOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  order_id?: string;

  @IsNotEmpty()
  @IsString()
  cart_id!: string;

  @ValidateNested()
  @Type(() => GokwikPaymentDetailsDto)
  payment_details!: GokwikPaymentDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikAddressDto)
  shipping_address?: GokwikAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikAddressDto)
  billing_address?: GokwikAddressDto;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  customer_phone!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikUserDetailsDto)
  user_details?: GokwikUserDetailsDto;

  @IsOptional()
  @IsString()
  user_agent?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikUtmDetailsDto)
  utm_details?: GokwikUtmDetailsDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  order_note?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikCreateOrderMetaDataDto)
  meta_data?: GokwikCreateOrderMetaDataDto;
}
