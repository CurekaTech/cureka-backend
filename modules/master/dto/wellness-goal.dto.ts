import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';

export class CreateWellnessGoalDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateWellnessGoalDto extends PartialType(CreateWellnessGoalDto) {}

export class UpdateWellnessGoalStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}
