import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PermissionAction } from '../enums/permission-action.enum';

export class CreatePermissionDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  code!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  module!: string;

  @IsNotEmpty()
  @IsEnum(PermissionAction)
  action!: PermissionAction;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}

export class UpdatePermissionStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
