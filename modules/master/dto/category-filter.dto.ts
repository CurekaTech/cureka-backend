import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { MasterListQueryDto } from './master-list-query.dto';

const parseStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') return JSON.parse(value) as string[];
  return undefined;
};

export class CreateCategoryFilterDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @Transform(parseStringArray)
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  values?: string[];

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateCategoryFilterDto extends PartialType(CreateCategoryFilterDto) {}

export class UpdateCategoryFilterStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class CategoryFilterQueryDto extends MasterListQueryDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsRefId()
  categoryRefId?: string;
}
