import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { APP_CONSTANTS, IsRefId } from '@packages/common';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { normalizeExpiryDateInput } from '../utils/expiry-date.util';
import { ProductInformationItemDto, CustomProductFaqDto } from './product-support.dto';
import { IStorageFileReference } from '@packages/storage';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import { IVariantCategoryFilterBinding } from '../interfaces/variant-details.interface';

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
    example: 'cetaphil-gentle-skin-cleanser',
    description: `Unique URL slug (max ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters). Auto-generated from the product name. Variant size/pack values are appended only when needed for uniqueness. SKU is never included.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH, {
    message: `Variant slug must not exceed ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters`,
  })
  slug?: string;

  @ApiPropertyOptional({
    example: '54141',
    description: 'External / WooCommerce product ID for this variant (vertical style_group upload).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalProductId?: string;

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

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gtinNumber?: string;

  @ApiPropertyOptional({ example: '30049099' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  hsnCode?: string;

  @ApiPropertyOptional({ example: 'BATCH-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiPropertyOptional({
    example: '31-12-2026',
    description: 'Expiry date in dd-mm-yyyy (also accepts yyyy-mm-dd). Stored on the variant.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeExpiryDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expiryDate must be a valid date in dd-mm-yyyy format',
  })
  expiryDate?: string;

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

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'Manually flag this variant as out of stock. ' +
      'When STOCK_INVENTORY_MANAGEMENT_ENABLED=false, stock-coupled values ' +
      '(outOfStock === stock<=0) are ignored so stock edits do not flip the flag.',
  })
  @IsOptional()
  @IsBoolean()
  outOfStock?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description:
      'When true and STOCK_INVENTORY_MANAGEMENT_ENABLED=true, this variant uses Cureka stock inventory. ' +
      'Defaults to false. Updating this flag does not change stock or outOfStock.',
  })
  @IsOptional()
  @IsBoolean()
  inCurekaInventory?: boolean;

  @ApiPropertyOptional({
    example: '5-7 Days',
    nullable: true,
    description: 'Estimated delivery window text for this variant (e.g. "3-5 Days").',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    return typeof value === 'string' ? value.trim() : value;
  })
  @IsString()
  @MaxLength(50)
  estimatedDeliveryTime?: string | null;

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

  @ApiPropertyOptional({ example: 'GST 12%' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxClass?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsString()
  status?: any;

  @ApiPropertyOptional({
    type: [String],
    example: ['paracetamol', 'fever relief', 'dolo'],
    description:
      'Free-form search tags for this variant (indexed in Typesense). In bulk upload, use comma or | separators.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchTags?: string[];

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

  @ApiPropertyOptional({
    example: 'Paracetamol 500mg',
    description: 'Per-variant display name (vertical bulk upload / variable PDP tab label).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [ProductInformationItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductInformationItemDto)
  productInformation?: ProductInformationItemDto[];

  @ApiPropertyOptional({ type: [CustomProductFaqDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomProductFaqDto)
  customFaqs?: CustomProductFaqDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  components?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  subscriptionEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  codAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emiAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  returnAllowed?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  returnPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  returnWindowDays?: number;

  @ApiPropertyOptional()
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
  @IsString()
  manufacturerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  importerAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  countryOfOriginRefId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresInMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  sizeChart?: IStorageFileReference | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  singleProductUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  productPageUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  healthConcernRefIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsRefId({ each: true })
  wellnessGoalRefIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  categoryFilters?: IVariantCategoryFilterBinding[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  packMetadata?: IProductPackMetadataItem[];
}

export class CreateProductMediaDto {
  @ApiProperty({
    enum: ProductMediaType,
    description:
      'image | video | size_chart | common. Use `common` for media shared across all variants of a variable product (stored at product level; returned on every variant in GET).',
  })
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

  @ApiPropertyOptional({
    description:
      'Variant SKU for variant-specific media. Ignored when type is `common` (common media is always product-scoped).',
  })
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

export class UpdateVariantDto extends CreateVariantDto {}
