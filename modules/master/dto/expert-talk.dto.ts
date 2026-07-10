import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { ExpertTalkContentType } from '../enums/expert-talk-content-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateExpertTalkItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  @MaxLength(2000)
  videoUrl!: string;

  @IsOptional()
  @IsEnum(ExpertTalkContentType)
  contentType?: ExpertTalkContentType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateExpertTalkItemDto extends PartialType(CreateExpertTalkItemDto) {}

export class UpdateExpertTalkItemStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ExpertTalkItemQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsEnum(ExpertTalkContentType)
  contentType?: ExpertTalkContentType;
}

export class PublicExpertTalkQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ExpertTalkContentType)
  contentType?: ExpertTalkContentType;
}

export class ReorderExpertTalkItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderExpertTalkItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderExpertTalkItemDto)
  items!: ReorderExpertTalkItemDto[];
}
