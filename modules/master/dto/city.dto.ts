import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateCityDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsUUID('4')
  stateId!: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateCityDto extends PartialType(CreateCityDto) {}

export class UpdateCityStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class CityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID('4')
  stateId?: string;

  @IsOptional()
  @IsUUID('4')
  countryId?: string;
}
