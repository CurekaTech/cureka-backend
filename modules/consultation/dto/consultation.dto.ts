import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { ConsultationAttendanceStatus } from '../enums/consultation-attendance-status.enum';
import { ConsultationStatus } from '../enums/consultation-status.enum';

export class CreateConsultationBookingDto {
  @IsUUID()
  doctorId!: string;

  @IsUUID()
  clinicId!: string;

  @IsUUID()
  slotId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  patientName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  patientMobile!: string;

  @IsOptional()
  @IsString()
  symptoms?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  otp?: string;
}

export class CancelConsultationDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class CompleteConsultationDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  diagnosis?: string;
}

export class RecommendFollowUpDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsISO8601()
  eligibleUntil?: string;
}

export class BookFollowUpDto {
  @IsUUID()
  recommendationRefId!: string;

  @IsUUID()
  slotId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  patientName!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  patientMobile!: string;
}

export class ConsultationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ConsultationStatus)
  status?: ConsultationStatus;
}

export class VerifyConsultationPaymentDto {
  @IsNotEmpty()
  @IsString()
  gatewayPaymentId!: string;
}

export class RescheduleConsultationDto {
  @IsUUID()
  slotId!: string;
}

export class UpdateConsultationAttendanceDto {
  @IsEnum(ConsultationAttendanceStatus)
  attendanceStatus!: ConsultationAttendanceStatus;
}

export class PrescriptionItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  medicineName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  dosage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  frequency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  duration?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class UpsertPrescriptionDto {
  @IsOptional()
  @IsString()
  additionalNotes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}

export class ConsultationReportQueryDto {
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}

export type CreateBookingPricingOverride = {
  pricingType: import('../enums/consultation-pricing-type.enum').ConsultationPricingType;
  amount: number;
};
