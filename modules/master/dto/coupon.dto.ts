import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CouponApplicabilityScope } from '../enums/coupon-applicability-scope.enum';
import { CouponDiscountType } from '../enums/coupon-discount-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateCouponDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  couponType!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  code!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sameUserLimit?: number | null;

  @IsNotEmpty()
  @IsEnum(CouponDiscountType)
  discountType!: CouponDiscountType;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPurchase?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxDiscount?: number | null;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  expiryDate!: Date;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsEnum(CouponApplicabilityScope)
  applicabilityScope?: CouponApplicabilityScope;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productRefIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brandRefIds?: string[];
}

export class UpdateCouponDto extends PartialType(CreateCouponDto) {}

export class UpdateCouponStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
