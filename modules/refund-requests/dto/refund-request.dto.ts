import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { RefundReason } from '../enums/refund-reason.enum';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateAdminRefundRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: RefundReason })
  @IsEnum(RefundReason)
  reason!: RefundReason;

  @ApiPropertyOptional()
  @ValidateIf((dto: CreateAdminRefundRequestDto) => dto.reason === RefundReason.OTHER)
  @IsNotEmpty()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  reasonDetails?: string;

  @ApiPropertyOptional({ description: 'Ignored for v1 — full refundable amount is used' })
  @IsOptional()
  @IsNumberString()
  requestedAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RefundCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ApproveRefundRequestDto {
  @ApiPropertyOptional({ description: 'Must equal the full refundable amount in v1' })
  @IsOptional()
  @IsNumberString()
  approvedAmount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RejectRefundRequestDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class AssignRefundRequestDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RetryRefundRequestDto {
  @ApiProperty()
  @Transform(trim)
  @IsNotEmpty()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  comment!: string;
}

export class RefundRequestListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RefundRequestStatus })
  @IsOptional()
  @IsEnum(RefundRequestStatus)
  status?: RefundRequestStatus;

  @ApiPropertyOptional({ enum: RefundReason })
  @IsOptional()
  @IsEnum(RefundReason)
  reason?: RefundReason;

  @ApiPropertyOptional({ enum: RefundPaymentProvider })
  @IsOptional()
  @IsEnum(RefundPaymentProvider)
  paymentProvider?: RefundPaymentProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  orderNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ enum: ['GREEN', 'ORANGE', 'RED'] })
  @IsOptional()
  @IsEnum(['GREEN', 'ORANGE', 'RED'] as const)
  slaStatus?: 'GREEN' | 'ORANGE' | 'RED';
}

export class RefundRequestIdParamDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}
