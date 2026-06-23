import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';

export class CreateHomeSectionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  title!: string;

  @IsNotEmpty()
  @IsEnum(HomeSectionType)
  type!: HomeSectionType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  index?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateHomeSectionStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class ReorderHomeSectionItemDto {
  @IsNotEmpty()
  @IsRefId()
  refId!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newIndex!: number;
}

export class ReorderHomeSectionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderHomeSectionItemDto)
  sections!: ReorderHomeSectionItemDto[];
}
