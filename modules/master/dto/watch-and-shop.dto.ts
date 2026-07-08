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
import { PaginationQueryDto, IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateWatchAndShopItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  videoUrl?: string;

  @IsNotEmpty()
  @IsRefId()
  productRefId!: string;

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

export class UpdateWatchAndShopItemDto extends PartialType(CreateWatchAndShopItemDto) {}

export class UpdateWatchAndShopItemStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class WatchAndShopItemQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class ReorderWatchAndShopItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderWatchAndShopItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderWatchAndShopItemDto)
  items!: ReorderWatchAndShopItemDto[];
}
