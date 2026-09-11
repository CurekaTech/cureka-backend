import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { PaginationQueryDto } from '@packages/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ReturnPickupProvider } from '../enums/return-pickup-provider.enum';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnQcResult } from '../enums/return-qc-result.enum';
import { ReturnResolution } from '../enums/return-resolution.enum';
import { ReturnStatus } from '../enums/return-status.enum';
import { CodRefundMethod } from '@modules/refund-requests/enums/cod-refund-method.enum';
import { BankAccountDetailsDto } from '@modules/refund-requests/dto/cod-refund-payout.dto';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** JSON-encoded when submitted through multipart alongside evidence files. */
const parseJson = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

/**
 * Multipart flattens nested objects/arrays to JSON strings. Parse then instantiate
 * nested DTOs so `@ValidateNested` receives class instances (plain objects cause
 * `*.undefined: an unknown value was passed to the validate function`).
 */
const parseJsonArrayOf =
  <T>(cls: new () => T) =>
  ({ value }: { value: unknown }): T[] | unknown => {
    const parsed = parseJson({ value });
    if (parsed === undefined) return undefined;
    if (!Array.isArray(parsed)) return parsed;
    return plainToInstance(cls, parsed);
  };

const parseJsonObjectOf =
  <T>(cls: new () => T) =>
  ({ value }: { value: unknown }): T | unknown => {
    const parsed = parseJson({ value });
    if (parsed === undefined || parsed === null) return parsed;
    if (typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
    return plainToInstance(cls, parsed);
  };

export class ReturnPickupAddressDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  recipientName!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  phoneNumber!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(255)
  landmark?: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  pincode!: string;
}

export class CreateReturnRequestItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderItemId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Desired replacement SKU when resolution is REPLACEMENT.',
  })
  @IsOptional()
  @IsUUID()
  replacementVariantId?: string;
}

export class CreateReturnRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ description: 'Reason Master id or refId.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  reasonId!: string;

  @ApiProperty({ enum: ReturnResolution })
  @IsEnum(ReturnResolution)
  resolution!: ReturnResolution;

  @ApiProperty({ type: [CreateReturnRequestItemDto] })
  @Transform(parseJsonArrayOf(CreateReturnRequestItemDto))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnRequestItemDto)
  items!: CreateReturnRequestItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  customerComments?: string;

  @ApiPropertyOptional({
    description:
      'Condition confirmations, e.g. { "unused": true, "originalPackaging": true }. ' +
      'Every declaration must be confirmed before the request is accepted.',
  })
  @IsOptional()
  @Transform(parseJson)
  @IsObject()
  conditionDeclarations?: Record<string, boolean>;

  @ApiPropertyOptional({
    description: 'Pickup address; defaults to the delivery address of the order.',
  })
  @IsOptional()
  @Transform(parseJsonObjectOf(ReturnPickupAddressDto))
  @ValidateNested()
  @Type(() => ReturnPickupAddressDto)
  pickupAddress?: ReturnPickupAddressDto;

  @ApiPropertyOptional({
    enum: CodRefundMethod,
    description:
      'Required when the order has a COD-paid portion and resolution is REFUND. Prepaid money always returns to the original payment source.',
  })
  @IsOptional()
  @IsEnum(CodRefundMethod)
  refundMethod?: CodRefundMethod;

  @ApiPropertyOptional({
    type: BankAccountDetailsDto,
    description: 'Required when refundMethod is BANK_ACCOUNT. Confirmation is validated and not stored.',
  })
  @IsOptional()
  @Transform(parseJsonObjectOf(BankAccountDetailsDto))
  @ValidateNested()
  @Type(() => BankAccountDetailsDto)
  bankDetails?: BankAccountDetailsDto;
}

export class CancelReturnRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class SubmitAdditionalInformationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  message!: string;
}

export class SubmitReturnBankDetailsDto {
  @ApiProperty({ enum: CodRefundMethod })
  @IsEnum(CodRefundMethod)
  refundMethod!: CodRefundMethod;

  @ApiPropertyOptional({ type: BankAccountDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDetailsDto)
  bankDetails?: BankAccountDetailsDto;
}

export class ReturnEligibilityQueryDto {
  @ApiPropertyOptional({
    description: 'Evaluate against the expired-product exception, which waives the window check.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  expiredProductClaim?: boolean;
}

export class AdminCreateReturnRequestDto extends CreateReturnRequestDto {
  @ApiPropertyOptional({
    description: 'Bypass the eligibility result. Requires a justification and is fully audited.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  overrideEligibility?: boolean;

  @ApiPropertyOptional({ description: 'Required when overrideEligibility is true.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  overrideReason?: string;

  @ApiPropertyOptional({ description: 'Internal-only note. Never shown to the customer.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  internalJustification?: string;

  @ApiPropertyOptional({ description: 'Explanation shown to the customer.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  customerVisibleExplanation?: string;
}

export class ReturnCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ApproveReturnRequestDto {
  @ApiPropertyOptional({
    description: 'Overrides the pickup requirement derived from the product policy and reason.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  pickupRequired?: boolean;

  @ApiPropertyOptional({ description: 'Overrides the QC requirement.' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  qcRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RejectReturnRequestDto {
  @ApiProperty({ description: 'Shown to the customer.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;

  @ApiPropertyOptional({ description: 'Internal-only note.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class RequestAdditionalInformationDto {
  @ApiProperty({ description: 'Shown to the customer.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(1000)
  message!: string;
}

export class AssignReturnRequestDto {
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

export class SchedulePickupDto {
  @ApiPropertyOptional({
    enum: ReturnPickupProvider,
    description:
      'MANUAL records an AWB booked outside Cureka. SHIPWAY/UNICOMMERCE (default) notify both Unicommerce reversePickup/create and Shipway POST /api/v2orders.',
  })
  @IsOptional()
  @IsEnum(ReturnPickupProvider)
  provider?: ReturnPickupProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  reverseAwbNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  courierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdatePickupStatusDto {
  @ApiProperty({ enum: ReturnPickupStatus })
  @IsEnum(ReturnPickupStatus)
  status!: ReturnPickupStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  eventAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  failureReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ApproveNoPickupDto {
  @ApiProperty({ description: 'Why the item does not need to come back.' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  justification!: string;

  @ApiPropertyOptional({ description: 'Explanation shown to the customer.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  customerVisibleExplanation?: string;
}

export class ReceiveAtWarehouseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class QcItemResultDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  returnRequestItemId!: string;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity!: number;

  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  acceptedQuantity!: number;

  @ApiPropertyOptional({ description: 'Required when any quantity is rejected.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SubmitQcDto {
  @ApiProperty({ type: [QcItemResultDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QcItemResultDto)
  items!: QcItemResultDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class LinkReplacementOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  replacementOrderId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ReturnListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReturnStatus })
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;

  @ApiPropertyOptional({ enum: ReturnResolution })
  @IsOptional()
  @IsEnum(ReturnResolution)
  resolution?: ReturnResolution;

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
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  returnNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  pickupRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  qcRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveredFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveredTo?: string;

  @ApiPropertyOptional({ enum: ['GREEN', 'ORANGE', 'RED'] })
  @IsOptional()
  @IsEnum(['GREEN', 'ORANGE', 'RED'] as const)
  slaStatus?: 'GREEN' | 'ORANGE' | 'RED';
}

export class ReturnQcResultQueryDto {
  @ApiPropertyOptional({ enum: ReturnQcResult })
  @IsOptional()
  @IsEnum(ReturnQcResult)
  result?: ReturnQcResult;
}

export class ReturnIdParamDto {
  @IsString()
  @IsNotEmpty()
  id!: string;
}

export class UpdateReturnPolicyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  returnAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  replaceAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  refundAllowed?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  returnWindowDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  replaceWindowDays?: number;

  @ApiPropertyOptional({ enum: PolicyWindowUnit })
  @IsOptional()
  @IsEnum(PolicyWindowUnit)
  returnWindowUnit?: PolicyWindowUnit;

  @ApiPropertyOptional({ enum: PolicyWindowUnit })
  @IsOptional()
  @IsEnum(PolicyWindowUnit)
  replaceWindowUnit?: PolicyWindowUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  returnPickupRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  returnQcRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  returnEvidenceRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  noPickupRefundAllowed?: boolean;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  returnPolicy?: string;
}
