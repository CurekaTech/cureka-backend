import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsInt,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateTestimonialDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  city!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  @Max(5)
  rating!: number;

  @IsNotEmpty()
  @IsString()
  description!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateTestimonialDto extends PartialType(CreateTestimonialDto) {}

export class UpdateTestimonialStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class TestimonialQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class PublicTestimonialQueryDto extends PaginationQueryDto {}
