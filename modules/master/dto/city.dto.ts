import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { IsRefId } from '@common/validators/is-ref-id.decorator';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateCityDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsRefId()
  stateRefId!: string;

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
  @IsRefId()
  stateRefId?: string;

  @IsOptional()
  @IsRefId()
  countryRefId?: string;
}
