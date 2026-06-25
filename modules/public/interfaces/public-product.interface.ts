import { ProductType } from '@modules/product/enums/product-type.enum';
import { ProductMediaType } from '@modules/product/enums/product-media-type.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { IProductInformationItem } from '@modules/product/interfaces/product-information.interface';
import { IProductCategoryFilterBinding } from '@modules/product/interfaces/product.interface';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IPublicProductPriceSummary {
  minSellingPrice: number;
  maxSellingPrice: number;
  minMrp: number;
  maxDiscountPercentage: number | null;
  inStock: boolean;
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
  refId: string;
  name: string;
  slug: string;
  productType: ProductType;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  brandRefId: string | null;
  brandName: string | null;
  productNatureRefId: string | null;
  productNatureName: string | null;
  primaryImageUrl: IStorageFileReferenceResponse | null;
  pricing: IPublicProductPriceSummary;
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  publishedAt: Date | null;
}

export interface IPublicProductVariant {
  id: string;
  sku: string;
  slug: string;
  mrp: number;
  sellingPrice: number;
  discountPercentage: number | null;
  stock: number;
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

export interface IPublicProductMedia {
  id: string;
  type: ProductMediaType;
  url: IStorageFileReferenceResponse | null;
  sortOrder: number;
  isPrimary: boolean;
  variantId: string | null;
}

export interface IPublicProductDetail {
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
  brandRefId: string | null;
  brandName: string | null;
  manufacturerRefId: string | null;
  manufacturerName: string | null;
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
  pricing: IPublicProductPriceSummary;
  /** Set when product detail is loaded via a variant slug URL. */
  selectedVariantId?: string | null;
  selectedVariantSlug?: string | null;
  attributes: Array<{ refId: string; name: string }>;
  variants: IPublicProductVariant[];
  media: IPublicProductMedia[];
  healthConcerns: Array<{ refId: string; name: string }>;
  wellnessGoals: Array<{ refId: string; name: string; image: IStorageFileReferenceResponse | null }>;
  categoryFilters: IProductCategoryFilterBinding[];
  tags: Array<{ refId: string; name: string; slug: string }>;
  faqs: Array<{ refId: string; question: string; answer: string }>;
  bundleItems: Array<{
    childProductRefId: string;
    childProductName: string;
    childProductSlug: string;
    quantity: number;
  }>;
}
