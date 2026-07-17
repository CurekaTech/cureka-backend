import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class GokwikPaymentDetailsDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['cod', 'prepaid', 'pp-cod'])
  payment_method!: 'cod' | 'prepaid' | 'pp-cod';

  @Type(() => Number)
  @IsNumber()
  payment_amount!: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  payment_id!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  payment_instrument!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  pg_payment_trnx_id!: string;
}

export class GokwikAddressDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  pincode!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  city!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  state!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  first_name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  last_name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  address!: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  phone!: string;
}

export class GokwikRewardsInfoDto {
  @IsNotEmpty()
  @IsString()
  reward_provider!: string;

  @IsNotEmpty()
  @IsString()
  transaction_id!: string;

  @Type(() => Number)
  @IsNumber()
  reward_amount!: number;
}

export class GokwikMetaDiscountDto {
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  tnc?: string;

  @IsNotEmpty()
  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  code?: string;
}

export class GokwikOtherChargeDto {
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsNotEmpty()
  @IsString()
  charge_type!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class GokwikPpcodDto {
  @Type(() => Number)
  @IsNumber()
  prepaid_amount!: number;

  @Type(() => Number)
  @IsNumber()
  payable_on_delivery!: number;
}

export class GokwikCreateOrderMetaDataDto {
  @IsOptional()
  @IsString()
  gst_no?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikRewardsInfoDto)
  rewards_info?: GokwikRewardsInfoDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GokwikMetaDiscountDto)
  discounts?: GokwikMetaDiscountDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GokwikOtherChargeDto)
  other_charges?: GokwikOtherChargeDto[];

  @IsOptional()
  @IsString()
  gokwik_order_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikPpcodDto)
  ppcod?: GokwikPpcodDto;

  @IsOptional()
  @IsString()
  rto_risk_flag?: string;
}

export class GokwikCreateOrderDto {
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
  @Type(() => GokwikCreateOrderMetaDataDto)
  meta_data?: GokwikCreateOrderMetaDataDto;
}
