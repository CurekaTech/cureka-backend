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
import { APP_CONSTANTS, IsRefId } from '@packages/common';
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

/** Variant image with metadata. Preferred over legacy `imageUrls` string array. */
export class VariantImageDto {
  @ApiPropertyOptional({
    example: 'images/a1b2c3d4-e5f6-7890-abcd-ef1234567890.webp',
    description:
      'Storage path from POST /uploads/images, or omit when sending the file via multipart variantImages_<sku>',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateVariantDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  sku!: string;

  @ApiPropertyOptional({
    example: 'cetaphil-gentle-skin-cleanser-red-xl',
    description: `Unique URL slug (max ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters). Auto-generated from product slug + attribute values when omitted.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH, {
    message: `Variant slug must not exceed ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters`,
  })
  slug?: string;

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

  @ApiPropertyOptional({ example: 'kg', description: 'Unit for weight (e.g. kg, g)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  weightUnit?: string;

  @ApiPropertyOptional({ example: 'kg', description: 'snake_case alias for weightUnit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  weight_unit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'Unit for length (e.g. cm, m)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lengthUnit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'snake_case alias for lengthUnit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  length_unit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'Unit for width (e.g. cm, m)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  widthUnit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'snake_case alias for widthUnit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  width_unit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'Unit for height (e.g. cm, m)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  heightUnit?: string;

  @ApiPropertyOptional({ example: 'cm', description: 'snake_case alias for heightUnit' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  height_unit?: string;

  @ApiPropertyOptional({ example: 365, description: 'Expiry in days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresIn?: number;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsString()
  status?: any;

  @ApiPropertyOptional({ type: [VariantAttributeValueDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantAttributeValueDto)
  attributes?: VariantAttributeValueDto[];

  @ApiPropertyOptional({
    type: [VariantImageDto],
    description:
      'Variant images with isPrimary/sortOrder. Preferred over imageUrls. url can be omitted when using multipart variantImages_<sku> files.',
    example: [
      { url: 'images/red-front.webp', isPrimary: true, sortOrder: 0 },
      { url: 'images/red-side.webp', isPrimary: false, sortOrder: 1 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantImageDto)
  images?: VariantImageDto[];

  @ApiPropertyOptional({
    type: [String],
    example: ['/uploads/images/a.png'],
    deprecated: true,
    description: 'Legacy: use images[] instead for isPrimary/sortOrder support',
  })
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
