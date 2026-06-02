import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateAgeGroupDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fromYears!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fromMonths!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  toYears!: number;

  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  toMonths!: number;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateAgeGroupDto extends PartialType(CreateAgeGroupDto) {}

export class UpdateAgeGroupStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
