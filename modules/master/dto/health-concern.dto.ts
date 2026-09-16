import { PartialType } from '@nestjs/mapped-types';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MasterStatus } from '../enums/master-status.enum';
import { PatientAudience } from '../enums/patient-audience.enum';
import { MasterFaqDto, parseMasterFaqArray } from './master-faq.dto';

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};

/** Preserve undefined; map empty string / null to null for nullable columns. */
const optionalNullableString = ({ value }: { value: unknown }): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return typeof value === 'string' ? value : String(value);
};

const optionalNullableAudience = ({
  value,
}: {
  value: unknown;
}): PatientAudience | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value as PatientAudience;
};

export class CreateHealthConcernDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'Medical condition display name',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(255)
  medicalConditionName?: string | null;

  @ApiPropertyOptional({
    description: 'Alternate medical condition name',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(255)
  alternateName?: string | null;

  @ApiPropertyOptional({
    description: 'Medical definition for JSON-LD MedicalCondition.description',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  medicalConditionDescription?: string | null;

  @ApiPropertyOptional({
    description: 'Real medical reviewer name; omit JSON-LD reviewedBy when null',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(255)
  reviewedByName?: string | null;

  @ApiPropertyOptional({
    description: 'Reviewer job title; include only with reviewedByName',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(255)
  reviewedByJobTitle?: string | null;

  @ApiPropertyOptional({
    description: 'Last medical review date (YYYY-MM-DD)',
    nullable: true,
    example: '2026-03-15',
  })
  @IsOptional()
  @Transform(optionalNullableString)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsDateString()
  lastReviewed?: string | null;

  @ApiPropertyOptional({
    enum: PatientAudience,
    description: 'Target audience: KIDS | ADULTS | ALL',
    nullable: true,
  })
  @IsOptional()
  @Transform(optionalNullableAudience)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsEnum(PatientAudience)
  patientAudience?: PatientAudience | null;

  @IsOptional()
  @IsEnum(MasterStatus)
  status?: MasterStatus;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  inHomePage?: boolean;

  @ApiPropertyOptional({ type: [MasterFaqDto] })
  @IsOptional()
  @Transform(parseMasterFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterFaqDto)
  faqs?: MasterFaqDto[];
}

export class UpdateHealthConcernDto extends PartialType(CreateHealthConcernDto) {
  @ApiPropertyOptional({ type: [MasterFaqDto] })
  @IsOptional()
  @Transform(parseMasterFaqArray)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MasterFaqDto)
  faqs?: MasterFaqDto[];
}

export class UpdateHealthConcernStatusDto {
  @IsNotEmpty()
  @IsEnum(MasterStatus)
  status!: MasterStatus;
}

export class UpdateHealthConcernIndexDto {
  @Transform(({ value }) => (value === null || value === '' ? null : Number(value)))
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(9999)
  sortIndex!: number | null;
}
