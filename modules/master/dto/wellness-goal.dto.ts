import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';
import { MasterFaqDto, parseMasterFaqArray } from './master-faq.dto';

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

export class CreateWellnessGoalDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  inHomePage?: boolean;

  @ApiPropertyOptional({ type: [MasterFaqDto] })
  @IsOptional()
  @Transform(parseMasterFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterFaqDto)
  faqs?: MasterFaqDto[];
}

export class UpdateWellnessGoalDto extends PartialType(CreateWellnessGoalDto) {
  @ApiPropertyOptional({ type: [MasterFaqDto] })
  @IsOptional()
  @Transform(parseMasterFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterFaqDto)
  faqs?: MasterFaqDto[];
}

export class UpdateWellnessGoalStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
