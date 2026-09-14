import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  IsArray,
  ValidateNested,
  IsUUID,
  Min,
} from 'class-validator';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { IsRefId } from '@packages/common';
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_ANSWER_MAX_LENGTH_MESSAGE,
  FAQ_ANSWER_REQUIRED_MESSAGE,
  FAQ_QUESTION_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH_MESSAGE,
  FAQ_QUESTION_REQUIRED_MESSAGE,
} from '@modules/master/utils/master-faq.util';

export class ProductInformationItemDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omitted on create — backend generates automatically' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiPropertyOptional({
    example: 'HIG20261234',
    description: 'Master product information label refId. Resolved from label name when omitted.',
  })
  @IsOptional()
  @IsRefId()
  labelRefId?: string;

  @ApiProperty({ example: 'Benefits' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  label!: string;

  @ApiProperty({ example: 'Provides relief from fever and mild pain.' })
  @IsNotEmpty()
  @IsString()
  description!: string;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Display order for this block. When omitted, resolved from the matching product information label sort order.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CustomProductFaqDto {
  @ApiProperty({ example: 'Can it be used daily?', maxLength: FAQ_QUESTION_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @MaxLength(FAQ_QUESTION_MAX_LENGTH, { message: FAQ_QUESTION_MAX_LENGTH_MESSAGE })
  question!: string;

  @ApiProperty({ example: 'Yes, as directed on the label.', maxLength: FAQ_ANSWER_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @MaxLength(FAQ_ANSWER_MAX_LENGTH, { message: FAQ_ANSWER_MAX_LENGTH_MESSAGE })
  answer!: string;
}

export class CreateProductFaqDto {
  @ApiProperty({ maxLength: FAQ_QUESTION_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_QUESTION_REQUIRED_MESSAGE })
  @MaxLength(FAQ_QUESTION_MAX_LENGTH, { message: FAQ_QUESTION_MAX_LENGTH_MESSAGE })
  question!: string;

  @ApiProperty({ maxLength: FAQ_ANSWER_MAX_LENGTH })
  @IsNotEmpty({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @IsString({ message: FAQ_ANSWER_REQUIRED_MESSAGE })
  @MaxLength(FAQ_ANSWER_MAX_LENGTH, { message: FAQ_ANSWER_MAX_LENGTH_MESSAGE })
  answer!: string;

  @ApiPropertyOptional({ enum: ProductFaqStatus })
  @IsOptional()
  @IsEnum(ProductFaqStatus)
  status?: ProductFaqStatus;
}

export class MapProductFaqDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsRefId({ each: true })
  faqRefIds!: string[];
}

export class MapProductTagDto {
  @ApiProperty({ type: [String] })
  tagNames!: string[];
}
