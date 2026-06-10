import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { ProductType } from '../enums/product-type.enum';
import {
  CreateBundleItemDto,
  CreateProductMediaDto,
  CreateVariantDto,
} from './variant.dto';

/** Step 1 — Identity & Classification */
export class ProductWizardStep1Dto {
  @ApiProperty({ example: 'Dolo 650mg Tablets' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  name!: string;

  @ApiProperty({ enum: ProductType })
  @IsNotEmpty()
  @IsEnum(ProductType)
  productType!: ProductType;

  @ApiProperty({ description: 'Product nature / material classification' })
  @IsNotEmpty()
  @IsRefId()
  productNatureRefId!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsRefId()
  categoryRefId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  subCategoryRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  subSubCategoryRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  subSubSubCategoryRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  brandRefId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  healthConcernRefIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['new-launch', 'bestseller'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  metaDescription?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metaKeywords?: string[];

  @ApiPropertyOptional({ example: 'dolo-650mg-tablets' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slug?: string;
}

/** Step 2 — Content & Media */
export class ProductWizardStep2Dto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  manufacturerRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  packerRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  importerRefId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  faqRefIds?: string[];

  @ApiPropertyOptional({ type: [CreateProductMediaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductMediaDto)
  media?: CreateProductMediaDto[];
}

/** Step 3 — Pricing & Inventory */
export class ProductWizardStep3Dto {
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @ValidateIf((dto: ProductWizardStep3Dto) => !dto.bundleItems?.length)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @ArrayMinSize(1)
  variants?: CreateVariantDto[];

  @ApiPropertyOptional({ type: [CreateBundleItemDto] })
  @ValidateIf((dto: ProductWizardStep3Dto) => !dto.variants?.length)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  @ArrayMinSize(1)
  bundleItems?: CreateBundleItemDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  subscriptionEnabled?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  codAvailable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  emiAvailable?: boolean;
}

/** Step 4 — Policies & Recommendations */
export class ProductWizardStep4Dto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  replaceAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replaceWindowDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnWindowDays?: number;
}

export class RejectProductWizardDto {
  @ApiProperty({ example: 'Missing compliance images' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
