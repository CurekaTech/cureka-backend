import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { PaginatedResult } from '@packages/common';
import { IPublicProductPriceSummary } from './public-product.interface';

export interface IPublicBundleBrand {
  refId: string;
  name: string;
  slug: string;
  logo: IStorageFileReference | IStorageFileReferenceResponse | null;
  description: string | null;
}

/** Published bundle card for public list. */
export interface IPublicBundleCard {
  /** Product UUID — use as `productId` when calling add-to-cart. */
  id: string;
  /** Alias of `id` for cart payload convenience (`AddCartItemDto.productId`). */
  productId: string;
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  bundleIcon: IStorageFileReference | IStorageFileReferenceResponse | null;
  /** Primary product media image — used when `bundleIcon` is unset. */
  primaryImageUrl: IStorageFileReference | IStorageFileReferenceResponse | null;
  brand: IPublicBundleBrand | null;
  curatedBy: string | null;
  curatedFor: string | null;
  pricing: IPublicProductPriceSummary;
  outOfStock: boolean;
  publishedAt: Date | null;
  permalink: string;
  productPageUrl: string | null;
  /** Variant UUID for add-to-cart (same as `variantId`). */
  defaultVariantId: string | null;
  /** Alias of `defaultVariantId` for cart payload convenience. */
  variantId: string | null;
}

export interface IPublicBundleListResponse extends PaginatedResult<IPublicBundleCard> {}

/** Published bundle detail for storefront. */
export interface IPublicBundleDetail extends IPublicBundleCard {
  components: string | null;
  categoryRefId: string;
  categoryName: string;
  categorySlugPath: string[];
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  emiAvailable: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  media: Array<{
    id: string;
    type: string;
    url: IStorageFileReference | IStorageFileReferenceResponse | null;
    sortOrder: number;
    isPrimary: boolean;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    slug: string;
    mrp: number;
    sellingPrice: number;
    discountPercentage: number | null;
    stock: number;
    inStock: boolean;
    outOfStock: boolean;
  }>;
  bundleItems: Array<{
    childProductRefId: string;
    childProductName: string;
    childProductSlug: string;
    quantity: number;
  }>;
  healthConcerns: Array<{ refId: string; name: string; slug: string }>;
  wellnessGoals: Array<{
    refId: string;
    name: string;
    image: IStorageFileReference | IStorageFileReferenceResponse | null;
  }>;
  tags: Array<{ refId: string; name: string; slug: string }>;
}
