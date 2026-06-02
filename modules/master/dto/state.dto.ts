import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
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
  @IsUUID('4')
  countryId!: string;

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
  @IsUUID('4')
  countryId?: string;
}
