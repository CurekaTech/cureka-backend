import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsArray, ValidateNested } from 'class-validator';
import { ProductFaqStatus } from '../enums/product-faq-status.enum';
import { IsRefId } from '@packages/common';
import { CreateVariantDto } from './variant.dto';

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

export class CreateProductTagDto {
  @ApiProperty({ example: 'Bestseller' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  name!: string;
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

export class UpdateVariantDto extends CreateVariantDto {}
