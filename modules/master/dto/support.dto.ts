import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '@packages/common';
import { ReasonWorkflow } from '@modules/master/enums/reason-workflow.enum';
import { SupportCategoryType } from '../enums/support-category-type.enum';
import { SupportContentStatus } from '../enums/support-content-status.enum';
import { SupportTicketCategory } from '../enums/support-ticket-category.enum';
import { SupportTicketPriority } from '../enums/support-ticket-priority.enum';
import { SupportTicketStatus } from '../enums/support-ticket-status.enum';
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
} from '../utils/master-faq.util';

export class SupportCategoryQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupportCategoryType })
  @IsOptional()
  @IsEnum(SupportCategoryType)
  type?: SupportCategoryType;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class CreateSupportCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  slug!: string;

  @ApiPropertyOptional({ enum: SupportCategoryType })
  @IsOptional()
  @IsEnum(SupportCategoryType)
  type?: SupportCategoryType;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class UpdateSupportCategoryDto extends PartialType(CreateSupportCategoryDto) {}

export class UpdateSupportCategoryStatusDto {
  @ApiProperty({ enum: SupportContentStatus })
  @IsEnum(SupportContentStatus)
  status!: SupportContentStatus;
}

export class SupportArticleQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryRefId?: string;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class CreateSupportArticleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  slug!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryRefId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class UpdateSupportArticleDto extends PartialType(CreateSupportArticleDto) {}

export class UpdateSupportArticleStatusDto {
  @ApiProperty({ enum: SupportContentStatus })
  @IsEnum(SupportContentStatus)
  status!: SupportContentStatus;
}

export class SupportFaqQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryRefId?: string;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class CreateSupportFaqDto {
  @ApiProperty({ maxLength: FAQ_QUESTION_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FAQ_QUESTION_MAX_LENGTH)
  question!: string;

  @ApiProperty({ maxLength: FAQ_ANSWER_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FAQ_ANSWER_MAX_LENGTH)
  answer!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryRefId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  sortOrder?: number;

  @ApiPropertyOptional({ enum: SupportContentStatus })
  @IsOptional()
  @IsEnum(SupportContentStatus)
  status?: SupportContentStatus;
}

export class UpdateSupportFaqDto extends PartialType(CreateSupportFaqDto) {}

export class UpdateSupportFaqStatusDto {
  @ApiProperty({ enum: SupportContentStatus })
  @IsEnum(SupportContentStatus)
  status!: SupportContentStatus;
}

export class SupportTicketQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SupportTicketStatus })
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @ApiPropertyOptional({ enum: SupportTicketCategory })
  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class PublicOrderSupportReasonsQueryDto {
  @ApiProperty({ enum: ReasonWorkflow })
  @IsEnum(ReasonWorkflow)
  workflow!: ReasonWorkflow;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderId?: string;
}

export class CreateSupportTicketDto {
  @ApiPropertyOptional({ enum: SupportTicketCategory })
  @ValidateIf((dto: CreateSupportTicketDto) => !dto.workflow)
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @ApiPropertyOptional({ enum: ReasonWorkflow })
  @IsOptional()
  @IsEnum(ReasonWorkflow)
  workflow?: ReasonWorkflow;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  reasonRefId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  guestName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  guestEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  guestMobile?: string;
}

export class UpdateSupportTicketStatusDto {
  @ApiProperty({ enum: SupportTicketStatus })
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}

export class AssignSupportTicketDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assignedTo!: string;
}

export class UpdateSupportTicketPriorityDto {
  @ApiProperty({ enum: SupportTicketPriority })
  @IsEnum(SupportTicketPriority)
  priority!: SupportTicketPriority;
}

export class AddTicketMessageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isInternalNote?: boolean;
}

export class PublicSupportSearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryRefId?: string;
}

export class MarkNotificationReadDto {
  @ApiProperty({ type: [String] })
  @IsUUID('4', { each: true })
  ids!: string[];
}
