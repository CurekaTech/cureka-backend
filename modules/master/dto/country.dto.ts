import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateCountryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(3)
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  phoneCode?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateCountryDto extends PartialType(CreateCountryDto) {}

export class UpdateCountryStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
