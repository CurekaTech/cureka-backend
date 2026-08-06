import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class GokwikPaymentDetailsDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(['cod', 'prepaid', 'pp-cod'])
  payment_method!: 'cod' | 'prepaid' | 'pp-cod';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payment_amount!: number;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  @MaxLength(200)
  payment_id?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  payment_instrument!: string;

  @IsOptional()
  @Transform(({ value }) => (value == null ? undefined : String(value).trim()))
  @IsString()
  @MaxLength(200)
  pg_payment_trnx_id?: string;
}

export class GokwikAddressDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'pincode must be a valid 6-digit Indian pincode' })
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
  @Matches(/^[6-9]\d{9}$/, { message: 'phone must be a valid 10-digit Indian mobile number' })
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
  @Min(0)
  reward_amount!: number;
}

export class GokwikMetaDiscountDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
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
  @Min(0)
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
  /** Present only for Partial COD (`payment_method: pp-cod`). GoKwik often sends `{}` for COD/prepaid. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  prepaid_amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  payable_on_delivery?: number;
}

/** GoKwik sends `"ppcod": {}` for non-Partial-COD — treat as absent. */
function normalizePpcod(value: unknown): unknown {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const prepaid = record['prepaid_amount'];
  const payable = record['payable_on_delivery'];
  const hasPrepaid = prepaid !== undefined && prepaid !== null && prepaid !== '';
  const hasPayable = payable !== undefined && payable !== null && payable !== '';
  if (!hasPrepaid && !hasPayable) return undefined;
  return value;
}

/** GoKwik sends `"rewards_info": {}` when no rewards are applied — treat as absent. */
function normalizeRewardsInfo(value: unknown): unknown {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const provider = record['reward_provider'];
  const transactionId = record['transaction_id'];
  const amount = record['reward_amount'];
  const hasProvider = typeof provider === 'string' && provider.trim().length > 0;
  const hasTransactionId = typeof transactionId === 'string' && transactionId.trim().length > 0;
  const hasAmount = amount !== undefined && amount !== null && amount !== '';
  if (!hasProvider && !hasTransactionId && !hasAmount) return undefined;
  return value;
}

export class GokwikCreateOrderMetaDataDto {
  @IsOptional()
  @IsString()
  gst_no?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeRewardsInfo(value))
  @ValidateNested()
  @Type(() => GokwikRewardsInfoDto)
  rewards_info?: GokwikRewardsInfoDto | null;

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
  @Transform(({ value }) => normalizePpcod(value))
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

  @IsDefined()
  @ValidateNested()
  @Type(() => GokwikPaymentDetailsDto)
  payment_details!: GokwikPaymentDetailsDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => GokwikAddressDto)
  shipping_address!: GokwikAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikAddressDto)
  billing_address?: GokwikAddressDto;

  @IsNotEmpty()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'customer_phone must be a valid 10-digit Indian mobile number',
  })
  @MaxLength(20)
  customer_phone!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GokwikCreateOrderMetaDataDto)
  meta_data?: GokwikCreateOrderMetaDataDto;
}
