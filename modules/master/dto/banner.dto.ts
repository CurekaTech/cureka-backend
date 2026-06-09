import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { BannerPlacement } from '../enums/banner-placement.enum';
import { BannerSlot } from '../enums/banner-slot.enum';
import { BannerResourceType } from '../enums/banner-resource-type.enum';

export class CreateBannerDto {
  @IsNotEmpty()
  @IsEnum(BannerPlacement)
  placement!: BannerPlacement;

  @IsOptional()
  @IsEnum(BannerSlot)
  slot?: BannerSlot;

  @IsNotEmpty()
  @IsEnum(BannerResourceType)
  resourceType!: BannerResourceType;

  @IsOptional()
  @IsRefId()
  resourceRefId?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  externalUrl?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdateBannerDto extends PartialType(CreateBannerDto) {}

export class UpdateBannerStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class BannerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BannerPlacement)
  placement?: BannerPlacement;

  @IsOptional()
  @IsEnum(BannerSlot)
  slot?: BannerSlot;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class ReorderBannerItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderBannersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderBannerItemDto)
  items!: ReorderBannerItemDto[];
}
