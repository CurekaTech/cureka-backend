import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { IsRefId } from '@packages/common';

export class CreateRoleDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsRefId({ each: true })
  permissionRefIds?: string[];
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class UpdateRoleStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
