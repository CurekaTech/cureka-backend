import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { APP_CONSTANTS, IsRefId } from '@packages/common';
import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import {
  CreateBundleItemDto,
  CreateProductMediaDto,
  CreateVariantDto,
} from './variant.dto';
import { CustomProductFaqDto, ProductInformationItemDto } from './product-support.dto';
import { ProductCategoryFilterBindingDto, ProductCategoryFilterQueryDto } from './product-category-filter.dto';
import {
  ADMIN_PRODUCT_LIST_SORT_FIELDS,
  AdminProductListSortField,
} from '../constants/admin-product-list-sort.constants';
import { normalizeExpiryDateInput } from '../utils/expiry-date.util';

export class ProductPackMetadataDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  packNumber!: number;

  @ApiPropertyOptional({ example: 'Family Pack' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'PACK-SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  skuCode?: string;

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @ApiPropertyOptional({ example: 'EXT-PACK-001' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productId?: string;

  @ApiPropertyOptional({ example: 'https://example.com/pack-1' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string;

  @ApiPropertyOptional({ example: '2 tablets' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  unit?: string;

  @ApiPropertyOptional({ example: 299 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({ example: 249 })
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  sellingPrice?: number;
}

export class ProductFileReferenceDto {
  @ApiProperty({ example: 'documents/size-charts/abc123.pdf' })
  @IsString()
  @MaxLength(1000)
  key!: string;

  @ApiProperty({ example: 'cureka-files-prod' })
  @IsString()
  @MaxLength(255)
  name!: string;
}

export class ProductCategoryHierarchyDto {
  @ApiProperty({ example: 'HEA20260016', description: 'Root category refId' })
  @IsNotEmpty()
  @IsRefId()
  categoryRefId!: string;

  @ApiPropertyOptional({ example: 'SUB20260011' })
  @IsOptional()
  @IsRefId()
  subCategoryRefId?: string;

  @ApiPropertyOptional({ example: 'SSC20260022' })
  @IsOptional()
  @IsRefId()
  subSubCategoryRefId?: string;

  @ApiPropertyOptional({ example: 'SSS20260033' })
  @IsOptional()
  @IsRefId()
  subSubSubCategoryRefId?: string;
}

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

  @ApiPropertyOptional({
    example: 'dolo-650mg-tablets',
    description: `URL slug (max ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters). Auto-generated from name when omitted.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH, {
    message: `Slug must not exceed ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters`,
  })
  slug?: string;

  @ApiPropertyOptional({
    example: 'EXT-PROD-001',
    description: 'External product identifier from import sheets or third-party systems',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalProductId?: string;

  @ApiPropertyOptional({ example: 'https://example.com/products/sample-product' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  singleProductUrl?: string;

  @ApiPropertyOptional({ type: [ProductPackMetadataDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPackMetadataDto)
  packMetadata?: ProductPackMetadataDto[];

  @ApiPropertyOptional({ example: '123 Industrial Area, Ahmedabad, Gujarat' })
  @IsOptional()
  @IsString()
  manufacturerAddress?: string;

  @ApiPropertyOptional({ example: '45 Packaging Lane, Mumbai, Maharashtra' })
  @IsOptional()
  @IsString()
  packerAddress?: string;

  @ApiPropertyOptional({ example: '12 Import Zone, Delhi' })
  @IsOptional()
  @IsString()
  importerAddress?: string;

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

  @ApiPropertyOptional({
    example: 'HEA20260016',
    description:
      'Primary (first) category hierarchy root refId. Required when `categories` is omitted. Kept for backward compatibility; when both are sent, `categories` wins.',
  })
  @ValidateIf((dto: CreateProductDto) => !dto.categories?.length)
  @IsNotEmpty({ message: 'categoryRefId is required when categories is not provided' })
  @IsRefId()
  categoryRefId?: string;

  @ApiPropertyOptional({
    description: 'Primary hierarchy sub-category. Ignored when `categories` is provided.',
  })
  @IsOptional()
  @IsRefId()
  subCategoryRefId?: string;

  @ApiPropertyOptional({
    description: 'Primary hierarchy sub-sub-category. Ignored when `categories` is provided.',
  })
  @IsOptional()
  @IsRefId()
  subSubCategoryRefId?: string;

  @ApiPropertyOptional({
    description: 'Primary hierarchy sub-sub-sub-category. Ignored when `categories` is provided.',
  })
  @IsOptional()
  @IsRefId()
  subSubSubCategoryRefId?: string;

  @ApiPropertyOptional({
    type: [ProductCategoryHierarchyDto],
    description:
      'One or more independent category hierarchies for this product. Preferred over the flat categoryRefId fields. The first entry is also stored as the primary hierarchy (flat response fields).',
    example: [
      {
        categoryRefId: 'HEA20260016',
        subCategoryRefId: 'SUB20260011',
        subSubCategoryRefId: 'SSC20260022',
      },
      {
        categoryRefId: 'BEA20260001',
        subCategoryRefId: 'SUB20260099',
      },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductCategoryHierarchyDto)
  categories?: ProductCategoryHierarchyDto[];

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

  @ApiPropertyOptional({
    type: [ProductInformationItemDto],
    description: 'Dynamic product information blocks (label + description)',
    example: [
      { label: 'Product Highlights', description: 'Key product highlights.', sortOrder: 1 },
      { label: 'Expert Advice', description: 'Consult your physician before use.', sortOrder: 2 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductInformationItemDto)
  productInformation?: ProductInformationItemDto[];

  @ApiPropertyOptional({ example: 24, description: 'Shelf life in months' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresInMonths?: number;

  @ApiPropertyOptional({
    example: '31-12-2026',
    description:
      'Expiry date (dd-mm-yyyy). For simple and bundle products, applied to the single pricing variant when variants[].expiryDate is omitted. For variable products, send expiryDate on each variants[] entry instead.',
  })
  @IsOptional()
  @Transform(({ value }) => normalizeExpiryDateInput(value))
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'expiryDate must be a valid date in dd-mm-yyyy format',
  })
  expiryDate?: string;

  @ApiPropertyOptional({
    example: 365,
    description:
      'Expiry in days. For simple and bundle products, applied to the pricing variant when variants[].expiresIn is omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresIn?: number;

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

  @ApiPropertyOptional({
    type: ProductFileReferenceDto,
    nullable: true,
    description:
      'Optional size chart. Accepts a storage path string (e.g. images/abc.jpg), { key, name }, or { url } from GET responses. Multipart file field "sizeChart" is also supported.',
    example: 'images/5d6657f9-0df5-4648-a874-f499dbb13979.jpg',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProductFileReferenceDto)
  sizeChart?: ProductFileReferenceDto | null;

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

  @ApiPropertyOptional({
    type: [ProductCategoryFilterBindingDto],
    description: 'Optional category filter bindings. Omit, send [], or send entries with empty values to skip.',
    example: [{ categoryFilterRefId: 'CFL20261234', values: ['Cotton', 'Breathable'] }],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCategoryFilterBindingDto)
  categoryFilters?: ProductCategoryFilterBindingDto[];

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

  @ApiPropertyOptional({
    type: [CreateBundleItemDto],
    description: 'Required for bundle products — at least one linked child product',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateBundleItemDto)
  @ArrayMinSize(1, { message: 'Bundle must contain at least one product' })
  bundleItems?: CreateBundleItemDto[];

  @ApiPropertyOptional({
    example: 'Dr. Patel, Dr. Shah',
    description: 'Bundle-only: doctors/experts who curated this bundle (comma-separated names)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  curatedBy?: string;

  @ApiPropertyOptional({
    example: 'Recommended for daily skincare routine and sensitive skin.',
    description: 'Bundle-only: who/what this bundle is curated for',
  })
  @IsOptional()
  @IsString()
  curatedFor?: string;

  @ApiPropertyOptional({
    example: 1999,
    description: 'Bundle pricing shortcut (MRP). Used when variants[] is omitted for productType=bundle.',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  mrp?: number;

  @ApiPropertyOptional({
    example: 1499,
    description: 'Bundle pricing shortcut (selling price). Used when variants[] is omitted for productType=bundle.',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  sellingPrice?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Bundle inventory shortcut. Used when variants[] is omitted for productType=bundle.',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    example: 25,
    description: 'Bundle discount % shortcut. Used when variants[] is omitted for productType=bundle.',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @ApiPropertyOptional({
    example: 'BND-SUMMER-KIT-001',
    description:
      'Unique SKU for the bundle pricing variant when variants[] is omitted. Must be unique across all product variants; auto-generated if omitted.',
  })
  @ValidateIf((dto: CreateProductDto) => dto.productType === ProductType.BUNDLE)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional({ type: [CreateProductMediaDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductMediaDto)
  media?: CreateProductMediaDto[];

  /** snake_case / UI-only fields accepted from admin form (not persisted on product) */
  @Allow()
  weight_unit?: unknown;

  @Allow()
  length_unit?: unknown;

  @Allow()
  width_unit?: unknown;

  @Allow()
  height_unit?: unknown;

  @Allow()
  discountType?: unknown;

  @Allow()
  priceDisplayMode?: unknown;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class UpdateProductStatusDto {
  @ApiProperty({ enum: ProductStatus })
  @IsNotEmpty()
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

export class BulkMarkOutOfStockDto {
  @ApiProperty({
    type: [String],
    example: ['PRO20261234', 'PRO20265678'],
    description:
      'Product refIds selected from the admin product list. Duplicates are ignored. Sets stock = 0 on every non-deleted variant of each product.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsRefId({ each: true })
  productRefIds!: string[];
}

export class BulkRestoreStockItemDto {
  @ApiProperty({ example: 'PRO20261234' })
  @IsNotEmpty()
  @IsRefId()
  productRefId!: string;

  @ApiProperty({ example: 50, description: 'Stock quantity to set on the product pricing variant(s)' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock!: number;
}

export class BulkRestoreStockDto {
  @ApiProperty({
    type: [BulkRestoreStockItemDto],
    description: 'Per-product stock restore values (max 500)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkRestoreStockItemDto)
  items!: BulkRestoreStockItemDto[];
}

export class ProductQueryDto extends ProductCategoryFilterQueryDto {
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

  @ApiPropertyOptional({
    enum: ADMIN_PRODUCT_LIST_SORT_FIELDS,
    default: 'createdAt',
    description:
      'Sort field: refId, name, slug, productType, status, categoryName, brandName, productNatureName, price, stock, sku, publishedAt, createdAt, updatedAt',
  })
  @IsOptional()
  @IsIn([...ADMIN_PRODUCT_LIST_SORT_FIELDS])
  sortBy?: AdminProductListSortField;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({
    enum: ProductStatus,
    description: 'Filter by status. Alias `approved` is accepted as `published`.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    // Admin UI historically used "approved" for live products
    return normalized === 'approved' ? ProductStatus.PUBLISHED : normalized;
  })
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

  @ApiPropertyOptional({
    type: [String],
    example: ['BRA20261234', 'BRA20261235'],
    description: 'Filter by multiple brands. Comma-separated or repeated query param.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  brandRefIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsRefId()
  productNatureRefId?: string;

  @ApiPropertyOptional({
    example: 'cetaphil-gentle-skin-cleanser-red-xl',
    description: `Filter products that have a variant with this exact slug (max ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters)`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH, {
    message: `Variant slug must not exceed ${APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH} characters`,
  })
  variantSlug?: string;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'When true, return only products where ALL active variants have stock = 0.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  outOfStock?: boolean;
}
