import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { ReasonPickupMode } from '../enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '../enums/reason-workflow.enum';

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

const parseStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return undefined;
};

export class CreateReasonMasterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  internalDescription?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ReasonWorkflow, { each: true })
  workflows!: ReasonWorkflow[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  @IsString({ each: true })
  categoryRefIds?: string[];

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  @IsString({ each: true })
  skuRefs?: string[];

  @IsOptional()
  @IsEnum(ReasonPickupMode)
  pickupMode?: ReasonPickupMode;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isMandatory?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  commentsRequired?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  imagesRequired?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  videoRequired?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  qcRequired?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  autoApprovalEligible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  minImages?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  maxImages?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  minVideos?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  maxVideos?: number;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  isCustomerVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateReasonMasterDto extends PartialType(CreateReasonMasterDto) {}

export class UpdateReasonMasterStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ReasonMasterQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsEnum(ReasonWorkflow)
  workflow?: ReasonWorkflow;

  @IsOptional()
  @IsEnum(ReasonPickupMode)
  pickupMode?: ReasonPickupMode;
}
