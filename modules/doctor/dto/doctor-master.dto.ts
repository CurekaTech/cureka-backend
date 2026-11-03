import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { MasterListQueryDto } from '@modules/master/dto/master-list-query.dto';

export class CreateSpecializationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  slug?: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateSpecializationDto extends PartialType(CreateSpecializationDto) {}

export class CreateLanguageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(16)
  code!: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {}

export class CreateQualificationDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;
}

export class UpdateQualificationDto extends PartialType(CreateQualificationDto) {}

export class UpdateDoctorMasterStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class DoctorMasterListQueryDto extends MasterListQueryDto {}
