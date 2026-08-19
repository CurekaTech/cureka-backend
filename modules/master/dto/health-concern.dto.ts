import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
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
import { MasterStatus } from '../enums/master-status.enum';

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

export class CreateHealthConcernDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  inHomePage?: boolean;
}

export class UpdateHealthConcernDto extends PartialType(CreateHealthConcernDto) {}

export class UpdateHealthConcernStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class UpdateHealthConcernIndexDto {
  @Transform(({ value }) => (value === null || value === '' ? null : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortIndex!: number | null;
}
