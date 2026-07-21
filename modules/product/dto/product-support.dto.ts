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

export class ProductInformationItemDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omitted on create — backend generates automatically' })
  @IsOptional()
  @IsUUID()
  id?: string;

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
  @ApiProperty({ example: 'Can it be used daily?' })
  @IsNotEmpty()
  @IsString()
  question!: string;

  @ApiProperty({ example: 'Yes, as directed on the label.' })
  @IsNotEmpty()
  @IsString()
  answer!: string;
}

export class CreateProductFaqDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  question!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
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
