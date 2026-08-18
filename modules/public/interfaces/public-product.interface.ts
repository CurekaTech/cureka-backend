import { ProductType } from '@modules/product/enums/product-type.enum';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { IProductInformationItem } from '@modules/product/interfaces/product-information.interface';
import { IProductCategoryFilterBinding } from '@modules/product/interfaces/product.interface';
import { IVariantInlineFaq } from '@modules/product/interfaces/variant-details.interface';
import { IProductPackMetadataItem } from '@modules/product/interfaces/product-pack-metadata.interface';
import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { PaginatedResult } from '@packages/common';
import { IPublicBrandProductListingContext } from './public-brand.interface';
import { IPublicCategoryProductListingContext } from './public-category.interface';

/** Cached/stored shape — logo is enriched to include a signed url on API responses. */
export interface IPublicPartySummary {
  refId: string;
  name: string;
  code: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
  description: string | null;
  contactPerson: string | null;
  email: string | null;
  mobileNumber: string | null;
  address: string | null;
  gstNumber: string | null;
  drugLicenseNumber: string | null;
}

export interface IPublicManufacturerSummary extends IPublicPartySummary {}

export interface IPublicPackerSummary extends IPublicPartySummary {
  remarks: string | null;
}

export interface IPublicImporterSummary extends Omit<IPublicPartySummary, 'description'> {
  iec: string | null;
}

/** Product-level price range — used on PDP where all variants are shown. */
export interface IPublicProductPriceSummary {
  minSellingPrice: number;
  maxSellingPrice: number;
  minMrp: number;
  maxDiscountPercentage: number | null;
  inStock: boolean;
}

/** Single-variant pricing on list cards (one row per displayed variant). */
export interface IPublicProductListPricing {
  mrp: number;
  sellingPrice: number;
  inStock: boolean;
  discount: number | null;
}

export interface IPublicCategorySummary {
  refId: string;
  name: string;
  slug: string;
}

/** One search result row per active product variant. */
export interface IPublicProductVariantSearchItem {
  refId: string;
  name: string;
  productSlug: string;
  variantSlug: string;
  productPageUrl: string | null;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  category: IPublicCategorySummary | null;
  subCategory: IPublicCategorySummary | null;
  subSubCategory: IPublicCategorySummary | null;
  subSubSubCategory: IPublicCategorySummary | null;
  variantId: string;
  sku: string;
  mrp: number;
  sellingPrice: number;
  discountPercentage: number | null;
  stock: number;
  inStock: boolean;
  outOfStock: boolean;
  weight: number | null;
  weightUnit: string | null;
  length: number | null;
  lengthUnit: string | null;
  width: number | null;
  widthUnit: string | null;
  height: number | null;
  heightUnit: string | null;
  status: VariantStatus;
  attributes: Array<{
    attributeRefId: string;
    attributeName: string;
    value: string;
  }>;
}

export interface IPublicProductCard {
  id: string;
  refId: string;
  name: string;
  slug: string;
  productType: ProductType;
  /** Default variant UUID for add-to-cart from listing cards. */
  defaultVariantId: string | null;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  /** Ordered category slugs from root → leaf for this product. */
  categorySlugPath: string[];
  /** Legacy-compatible path, e.g. /shop/skin-care/skin-serum/anti-wrinkle-serum/{slug} */
  permalink: string;
  /** Legacy storefront path from the list variant's product_page_url when available. */
  productPageUrl: string | null;
  brandRefId: string | null;
  brandName: string | null;
  brandSlug: string | null;
  productNatureRefId: string | null;
  productNatureName: string | null;
  primaryImageUrl: IStorageFileReference | IStorageFileReferenceResponse | null;
  pricing: IPublicProductListPricing;
  /**
   * OOS flag for the displayed list variant (`variantId` / `defaultVariantId`).
   * True when that variant is marked out of stock by admin.
   */
  outOfStock: boolean;
  /** True when the product carries the `bestsellers` tag. */
  isBestSeller: boolean;
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  publishedAt: Date | null;
  tags: Array<{ refId: string; name: string; slug: string }>;
  /** Primary list variant — lowest-price active variant, or the only active variant for simple products. */
  variantId: string | null;
}

export interface IPublicProductVariant {
  id: string;
  sku: string;
  slug: string;
  displayName?: string | null;
  description?: string | null;
  productInformation?: IProductInformationItem[];
  faqs?: IVariantInlineFaq[];
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string[] | null;
  components?: string | null;
  subscriptionEnabled?: boolean;
  codAvailable?: boolean;
  emiAvailable?: boolean;
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
  replaceAllowed: boolean;
  replaceWindowDays: number | null;
  manufacturerRefId?: string | null;
  manufacturerName?: string | null;
  manufacturerAddress?: string | null;
  packerRefId?: string | null;
  packerName?: string | null;
  packerAddress?: string | null;
  importerRefId?: string | null;
  importerName?: string | null;
  importerAddress?: string | null;
  countryOfOriginRefId?: string | null;
  countryOfOriginName?: string | null;
  expiresInMonths?: number | null;
  sizeChart?: IStorageFileReferenceResponse | null;
  singleProductUrl?: string | null;
  productPageUrl?: string | null;
  healthConcernRefIds?: string[];
  wellnessGoalRefIds?: string[];
  tagNames?: string[];
  categoryFilters?: IProductCategoryFilterBinding[];
  packMetadata?: IProductPackMetadataItem[];
  mrp: number;
  sellingPrice: number;
  discountPercentage: number | null;
  stock: number;
  inStock: boolean;
  outOfStock: boolean;
  weight: number | null;
  weightUnit: string | null;
  length: number | null;
  lengthUnit: string | null;
  width: number | null;
  widthUnit: string | null;
  height: number | null;
  heightUnit: string | null;
  /** Expiry date as `dd-mm-yyyy`. Stored value when set; otherwise derived from product `expiresInMonths` relative to today; null if neither. */
  expiryDate: string | null;
  status: VariantStatus;
  attributes: Array<{
    attributeRefId: string;
    attributeName: string;
    value: string;
  }>;
  images?: IPublicProductMedia[];
}

export interface IPublicProductMedia {
  id: string;
  type: ProductMediaType;
  url: IStorageFileReferenceResponse | null;
  sortOrder: number;
  isPrimary: boolean;
  variantId: string | null;
}

export interface IPublicProductDetail {
  id: string;
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  components: string | null;
  productType: ProductType;
  productNatureRefId: string | null;
  productNatureName: string | null;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  subSubCategoryRefId: string | null;
  subSubCategoryName: string | null;
  subSubSubCategoryRefId: string | null;
  subSubSubCategoryName: string | null;
  /** All category hierarchies (primary first). Empty when not loaded. */
  categories?: Array<{
    categoryRefId: string;
    categoryName: string;
    subCategoryRefId: string | null;
    subCategoryName: string | null;
    subSubCategoryRefId: string | null;
    subSubCategoryName: string | null;
    subSubSubCategoryRefId: string | null;
    subSubSubCategoryName: string | null;
    sortOrder: number;
  }>;
  /** Ordered category slugs from root → leaf for this product. */
  categorySlugPath: string[];
  /** Legacy-compatible path, e.g. /shop/skin-care/skin-serum/anti-wrinkle-serum/{slug} */
  permalink: string;
  brandRefId: string | null;
  brandName: string | null;
  brandSlug: string | null;
  manufacturerRefId: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  packerRefId: string | null;
  packerName: string | null;
  packerAddress: string | null;
  importerRefId: string | null;
  importerName: string | null;
  importerAddress: string | null;
  /** Optional enriched party summaries populated by the public API response */
  manufacturer?: IPublicManufacturerSummary | null;
  packer?: IPublicPackerSummary | null;
  importer?: IPublicImporterSummary | null;
  countryOfOriginRefId: string | null;
  countryOfOriginName: string | null;
  productInformation: IProductInformationItem[];
  expiresInMonths: number | null;
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  emiAvailable: boolean;
  replaceAllowed: boolean;
  replaceWindowDays: number | null;
  returnAllowed: boolean;
  returnPolicy: string | null;
  returnWindowDays: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  publishedAt: Date | null;
  sizeChart: IStorageFileReferenceResponse | null;
  pricing: IPublicProductPriceSummary;
  /**
   * True when the displayed selling price is above `shipping_charge_threshold`
   * from admin settings (eligible for free delivery on a single-item order).
   */
  isFreeDelivery: boolean;
  /** Set when product detail is loaded via a variant slug URL. */
  selectedVariantId?: string | null;
  selectedVariantSlug?: string | null;
  attributes: Array<{ refId: string; name: string }>;
  variants: IPublicProductVariant[];
  media: IPublicProductMedia[];
  healthConcerns: Array<{ refId: string; name: string; slug: string }>;
  wellnessGoals: Array<{
    refId: string;
    name: string;
    image: IStorageFileReferenceResponse | null;
  }>;
  categoryFilters: IProductCategoryFilterBinding[];
  tags: Array<{ refId: string; name: string; slug: string }>;
  faqs: Array<{ refId: string; question: string; answer: string }>;
  bundleItems: Array<{
    childProductRefId: string;
    childProductName: string;
    childProductSlug: string;
    quantity: number;
  }>;
  /** Active banners with placement `pdp` from banner master (empty when none). */
  banners: IStorefrontBannerItem[];
}

export interface IPublicProductListResponse extends PaginatedResult<IPublicProductCard> {
  /** Present when the listing is filtered by categorySlug or categoryRefId. */
  category?: IPublicCategoryProductListingContext | null;
  /** Present when the listing is filtered by a single brandSlug or brandRefId. */
  brand?: IPublicBrandProductListingContext | null;
}
