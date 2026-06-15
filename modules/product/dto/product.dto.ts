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

  @ApiProperty({ enum: ProductType })
  @IsNotEmpty()
  @IsEnum(ProductType)
  productType!: ProductType;

  @ApiProperty({ example: 'MED20261234' })
  @IsNotEmpty()
  @IsRefId()
  productNatureRefId!: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  brandRefId?: string;

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

  @ApiPropertyOptional({ type: [String], example: ['bestseller', 'monsoon-sale'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiPropertyOptional({ type: [String] })
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
