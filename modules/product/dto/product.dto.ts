import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import {
  CreateBundleItemDto,
  CreateProductMediaDto,
  CreateVariantDto,
} from './variant.dto';
import { CustomProductFaqDto } from './product-support.dto';

export class CreateProductDto {
  @ApiPropertyOptional({ description: 'Nullable until vendor module is live' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiProperty({ example: 'Dolo 650mg Tablets' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  name!: string;

  @ApiPropertyOptional({ example: 'dolo-650mg-tablets' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  components?: string;

  @ApiProperty({ enum: ProductType, description: 'simple = Single Product, variable = Variant Product' })
  @IsNotEmpty()
  @IsEnum(ProductType)
  productType!: ProductType;

  @ApiPropertyOptional({ example: 'MED20261234' })
  @IsOptional()
  @IsRefId()
  productNatureRefId?: string;

  @ApiProperty({ example: 'HEA20260016' })
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

  @ApiProperty({ example: 'BRA20261234' })
  @IsNotEmpty()
  @IsRefId()
  brandRefId!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  countryOfOriginRefId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Required when productType is variable' })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.VARIABLE)
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  @ArrayMinSize(1)
  attributeRefIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  highlights?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expertAdvice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyIngredients?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  otherIngredients?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preventiveNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accessoriesSpecifications?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  directionsOfUse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  feedingTable?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  safetyInformation?: string;

  @ApiPropertyOptional({ example: '30 g' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productWeight?: string;

  @ApiPropertyOptional({ example: '15 x 4 x 3 cm' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  productDimensions?: string;

  @ApiPropertyOptional({ example: 24, description: 'Shelf life in months' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresInMonths?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  returnAllowed?: boolean;

  @ApiPropertyOptional({ example: '7 Days Return' })
  @IsOptional()
  @IsString()
  returnPolicy?: string;

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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  healthConcernRefIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['WLG20261234'] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  wellnessGoalRefIds?: string[];

  @ApiPropertyOptional({ type: [String], example: ['bestseller', 'monsoon-sale'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiPropertyOptional({ type: [CustomProductFaqDto], description: 'Inline product FAQs (question + answer)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomProductFaqDto)
  customFaqs?: CustomProductFaqDto[];

  @ApiPropertyOptional({ type: [String], description: 'Link existing reusable product FAQs by refId' })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  faqRefIds?: string[];

  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @ValidateIf((dto: CreateProductDto) => dto.productType !== ProductType.BUNDLE)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  @ArrayMinSize(1)
  variants?: CreateVariantDto[];

  @ApiPropertyOptional({ type: [CreateBundleItemDto] })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  @ArrayMinSize(1)
  bundleItems?: CreateBundleItemDto[];

  @ApiPropertyOptional({ type: [CreateProductMediaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductMediaDto)
  media?: CreateProductMediaDto[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus })
  @IsNotEmpty()
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

export class ProductQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  categoryRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  brandRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  productNatureRefId?: string;
}
