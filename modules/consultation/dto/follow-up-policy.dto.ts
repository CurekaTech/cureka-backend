import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { FollowUpPricingMode } from '../enums/follow-up-pricing-mode.enum';

export class UpsertFollowUpPolicyDto {
  @IsOptional()
  @IsBoolean()
  followUpAllowed?: boolean;

  @IsOptional()
  @IsEnum(FollowUpPricingMode)
  pricingMode?: FollowUpPricingMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  freeWindowDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paidFeeAmount?: number;
}
