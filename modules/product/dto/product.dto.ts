import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  Allow,
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

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
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
}
