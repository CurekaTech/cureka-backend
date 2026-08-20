import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaginationQueryDto } from '@packages/common';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MembershipBillingCycle } from '../enums/membership-billing-cycle.enum';
import { MembershipBenefitType } from '../enums/membership-benefit-type.enum';
import { MembershipBenefitValueType } from '../enums/membership-benefit-value-type.enum';
import { MembershipPaymentStatus } from '../enums/membership-payment-status.enum';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';
import { MembershipStatus } from '../enums/membership-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';

const toOptionalNumber = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return value === '' ? null : value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

export class CreateMembershipBenefitDto {
  @ApiProperty({ enum: MembershipBenefitType })
  @IsEnum(MembershipBenefitType)
  benefitType!: MembershipBenefitType;

  @ApiProperty({ enum: MembershipBenefitValueType })
  @IsEnum(MembershipBenefitValueType)
  valueType!: MembershipBenefitValueType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number | null;

  @ApiPropertyOptional({
    example: 499,
    description: 'For FREE_SHIPPING — free shipping applies only when order total ≥ this amount',
  })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ enum: MembershipPlanStatus })
  @IsOptional()
  @IsEnum(MembershipPlanStatus)
  status?: MembershipPlanStatus;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

/** Include `id` or `refId` to update an existing benefit; omit both to create. */
export class UpsertMembershipBenefitDto extends CreateMembershipBenefitDto {
  @ApiPropertyOptional({ description: 'Existing benefit UUID — omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ description: 'Existing benefit refId — omit to create' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  refId?: string;

  /** Echoed from GET — ignored on write. */
  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  membershipPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  updatedAt?: string;
}

export class SyncMembershipBenefitsDto {
  @ApiProperty({ type: [UpsertMembershipBenefitDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertMembershipBenefitDto)
  benefits!: UpsertMembershipBenefitDto[];
function toOptionalNumber({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') return value === '' ? null : value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

export class CreateMembershipPlanDto {
  @ApiProperty({ example: 'Gold' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ example: 999 })
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ default: 'INR' })
  @IsOptional()
  @IsString()
  @MaxLength(5)
  currency?: string;

  @ApiProperty({ enum: MembershipBillingCycle })
  @IsEnum(MembershipBillingCycle)
  billingCycle!: MembershipBillingCycle;

  @ApiProperty({ example: 365 })
  @IsInt()
  @Min(1)
  validityDays!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  renewalEnabled?: boolean;

  @ApiPropertyOptional({ default: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodDays?: number;

  @ApiPropertyOptional({ enum: MembershipPlanStatus })
  @IsOptional()
  @IsEnum(MembershipPlanStatus)
  status?: MembershipPlanStatus;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ enum: SubscriptionRenewalMethod })
  @IsOptional()
  @IsEnum(SubscriptionRenewalMethod)
  renewalMethod?: SubscriptionRenewalMethod;

  @ApiPropertyOptional({
    type: () => [UpsertMembershipBenefitDto],
    description: 'Optional benefits created/synced with the plan',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertMembershipBenefitDto)
  benefits?: UpsertMembershipBenefitDto[];
}

  @ApiPropertyOptional({
    type: () => [UpsertMembershipBenefitDto],
    description: 'Optional benefits created/synced with the plan',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertMembershipBenefitDto)
  benefits?: UpsertMembershipBenefitDto[];
}

export class UpdateMembershipPlanDto extends PartialType(CreateMembershipPlanDto) {
  /** Echoed from GET — ignored on write. */
  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  refId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  updatedAt?: string;
}

export class CreateMembershipBenefitDto {
  @ApiProperty({ enum: MembershipBenefitType })
  @IsEnum(MembershipBenefitType)
  benefitType!: MembershipBenefitType;

  @ApiProperty({ enum: MembershipBenefitValueType })
  @IsEnum(MembershipBenefitValueType)
  valueType!: MembershipBenefitValueType;

export class UpdateMembershipPlanDto extends PartialType(CreateMembershipPlanDto) {
  /** Echoed from GET — ignored on write. */
  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  id?: string;
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value?: number | null;

  @ApiPropertyOptional({
    example: 499,
    description: 'For FREE_SHIPPING — free shipping applies only when order total ≥ this amount',
  })
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minOrderValue?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  refId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  updatedAt?: string;
}

/** Include `id` or `refId` to update an existing benefit; omit both to create. */
export class UpsertMembershipBenefitDto extends CreateMembershipBenefitDto {
  @ApiPropertyOptional({ description: 'Existing benefit UUID — omit to create' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({ description: 'Existing benefit refId — omit to create' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  refId?: string;

  /** Echoed from GET — ignored on write. */
  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  membershipPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Allow()
  updatedAt?: string;
}

export class SyncMembershipBenefitsDto {
  @ApiProperty({ type: [UpsertMembershipBenefitDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertMembershipBenefitDto)
  benefits!: UpsertMembershipBenefitDto[];
}

export class UpdateMembershipBenefitDto extends PartialType(CreateMembershipBenefitDto) {}

export class PurchaseMembershipDto {
  @ApiPropertyOptional({ description: 'Prefer planRefId for storefront' })
  @ValidateIf((o: PurchaseMembershipDto) => !o.planId)
  @IsString()
  planRefId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: PurchaseMembershipDto) => !o.planRefId)
  @IsUUID()
  planId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  termsAccepted?: boolean;
}

export class ChangeMembershipPlanDto {
  @ApiPropertyOptional()
  @ValidateIf((o: ChangeMembershipPlanDto) => !o.planId)
  @IsString()
  planRefId?: string;

  @ApiPropertyOptional()
  @ValidateIf((o: ChangeMembershipPlanDto) => !o.planRefId)
  @IsUUID()
  planId?: string;
}

export class CancelMembershipDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminMembershipPlanQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MembershipPlanStatus })
  @IsOptional()
  @IsEnum(MembershipPlanStatus)
  status?: MembershipPlanStatus;
}

export class AdminUserMembershipQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;
}

export class AdminMembershipPaymentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MembershipPaymentStatus })
  @IsOptional()
  @IsEnum(MembershipPaymentStatus)
  status?: MembershipPaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userMembershipId?: string;
}
