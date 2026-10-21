import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PromotionalOfferTargetRole } from '../enums/promotional-offer-target-role.enum';
import { PromotionalOfferType } from '../enums/promotional-offer-type.enum';

export class PromotionalOfferTargetDto {
  @IsEnum(PromotionalOfferTargetRole)
  role!: PromotionalOfferTargetRole;

  @IsUUID()
  variantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number | null;
}

export class CreatePromotionalOfferDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  internalDescription?: string | null;

  @IsString()
  @MaxLength(500)
  customerMessage!: string;

  @IsEnum(PromotionalOfferType)
  offerType!: PromotionalOfferType;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  expiryDate!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  sameUserLimit?: number | null;

  @IsObject()
  config!: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PromotionalOfferTargetDto)
  targets!: PromotionalOfferTargetDto[];
}

export class UpdatePromotionalOfferDto extends CreatePromotionalOfferDto {}

export class UpdatePromotionalOfferStatusDto {
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class PromotionalOfferListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PromotionalOfferType)
  offerType?: PromotionalOfferType;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}
