import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsRefId } from '@packages/common';
import { ProductMediaType } from '../enums/product-media-type.enum';

export class VariantAttributeValueDto {
  @ApiProperty({ example: 'COL20261234', description: 'Attribute master refId' })
  @IsNotEmpty()
  @IsRefId()
  attributeRefId!: string;

  @ApiProperty({ example: 'white' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  value!: string;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  sku!: string;

  @ApiPropertyOptional({ example: 'VSKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vendorSku?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiProperty({ example: 1200 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mrp!: number;

  @ApiProperty({ example: 999 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice!: number;

  @ApiPropertyOptional({ example: 16.75 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;

  @ApiPropertyOptional({ example: 0.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  length?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ example: 365, description: 'Expiry in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresIn?: number;

  @ApiPropertyOptional({ type: [VariantAttributeValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeValueDto)
  attributes?: VariantAttributeValueDto[];

  @ApiPropertyOptional({ type: [String], example: ['/uploads/images/a.png'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageUrls?: string[];
}

export class CreateProductMediaDto {
  @ApiProperty({ enum: ProductMediaType })
  @IsEnum(ProductMediaType)
  type!: ProductMediaType;

  @ApiPropertyOptional({
    example: 'images/a1b2c3d4-e5f6-7890-abcd-ef1234567890.webp',
    description:
      'Storage path from upload API or omit when sending image files via multipart "images" field',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Variant SKU for variant-specific media' })
  @IsOptional()
  @IsString()
  variantSku?: string;
}

export class CreateBundleItemDto {
  @ApiProperty({ example: 'PRO20261234', description: 'Child product refId' })
  @IsNotEmpty()
  @IsRefId()
  childProductRefId!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}
