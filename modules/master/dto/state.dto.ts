import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { IsRefId } from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateStateDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  code?: string;

  @IsNotEmpty()
  @IsRefId()
  countryRefId!: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateStateDto extends PartialType(CreateStateDto) {}

export class UpdateStateStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class StateQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsRefId()
  countryRefId?: string;
}
