import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class DoctorAvailabilityRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetDoctorAvailabilityDto {
  @IsUUID()
  clinicId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DoctorAvailabilityRuleDto)
  rules!: DoctorAvailabilityRuleDto[];
}

export class GenerateDoctorSlotsDto {
  @IsUUID()
  clinicId!: string;

  @IsISO8601()
  fromDate!: string;

  @IsISO8601()
  toDate!: string;
}
