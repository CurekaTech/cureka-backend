import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { IStorageFileReferenceResponse, IStorageFileReference } from '@packages/storage';
import { IProductInformationItem } from './product-information.interface';
import { IProductPackMetadataItem } from './product-pack-metadata.interface';
import { IVariantDetailFields, IVariantInlineFaq } from './variant-details.interface';

export interface IVariantAttributeValue {
  attributeRefId: string;
  attributeName: string;
  value: string;
}

export interface IProductVariantImage {
  id: string;
  type: ProductMediaType;
  url: IStorageFileReferenceResponse | null;
  sortOrder: number;
  isPrimary: boolean;
}

export interface IProductVariant {
  id: string;
  sku: string;
  slug: string;
  externalProductId: string | null;
  vendorSku: string | null;
  barcode: string | null;
  gtinNumber: string | null;
  hsnCode: string | null;
  batchNumber: string | null;
  /** Expiry date as `dd-mm-yyyy` in API responses. */
  expiryDate: string | null;
  mrp: number;
  sellingPrice: number;
  discountPercentage: number | null;
  stock: number;
  outOfStock: boolean;
  /** Estimated delivery window text (e.g. "3-5 Days"), or null when unset. */
  estimatedDeliveryTime: string | null;
  /** True when this variant is marked as a Top Product for category PLP ordering. */
  isTop: boolean;
  /** Explicit ordering within Top Products. Lower values appear first. */
  topSortOrder: number | null;
  weight: number | null;
  weightUnit: string | null;
  length: number | null;
  lengthUnit: string | null;
  width: number | null;
  widthUnit: string | null;
  height: number | null;
  heightUnit: string | null;
  expiresIn: number | null;
  searchTags: string[] | null;
  status: VariantStatus;
  combinationKey: string | null;
  attributes: IVariantAttributeValue[];
  images: IProductVariantImage[];
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
  returnAllowed?: boolean;
  returnPolicy?: string | null;
  returnWindowDays?: number | null;
  replaceAllowed?: boolean;
  replaceWindowDays?: number | null;
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
  sizeChart?: IStorageFileReference | IStorageFileReferenceResponse | null;
  singleProductUrl?: string | null;
  healthConcernRefIds?: string[];
  wellnessGoalRefIds?: string[];
  tagNames?: string[];
  categoryFilters?: IVariantDetailFields['categoryFilters'];
  packMetadata?: IProductPackMetadataItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductMedia {
  id: string;
  type: ProductMediaType;
  url: IStorageFileReferenceResponse | null;
  sortOrder: number;
  isPrimary: boolean;
  variantId: string | null;
}

export interface IProductBundleItem {
  id: string;
  childProductRefId: string;
  childProductName: string;
  quantity: number;
}

export interface IProductTag {
  refId: string;
  name: string;
  slug: string;
}

export interface IProductFaq {
  refId: string;
  question: string;
  answer: string;
  sequence: number;
}

export interface IProductAttribute {
  refId: string;
  name: string;
}

export interface IProductWellnessGoal {
  refId: string;
  name: string;
  image: IStorageFileReferenceResponse | null;
}

export interface IProductCategoryFilterBinding {
  categoryFilterRefId: string;
  categoryFilterName: string;
  values: string[];
}

export interface IProductCategoryHierarchy {
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subCategoryName: string | null;
  subSubCategoryRefId: string | null;
  subSubCategoryName: string | null;
  subSubSubCategoryRefId: string | null;
  subSubSubCategoryName: string | null;
  sortOrder: number;
}

export interface IProduct {
  id: string;
  refId: string;
  vendorId: string | null;
  name: string;
  slug: string;
  externalProductId: string | null;
  singleProductUrl: string | null;
  packMetadata: IProductPackMetadataItem[];
  manufacturerAddress: string | null;
  packerAddress: string | null;
  importerAddress: string | null;
  description: string | null;
  components: string | null;
  productType: ProductType;
  productNatureRefId: string | null;
  productNatureName: string | null;
  /** Primary hierarchy (first entry in `categories`) — kept for backward compatibility. */
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subSubCategoryRefId: string | null;
  subSubSubCategoryRefId: string | null;
  /** All category hierarchies assigned to this product. */
  categories: IProductCategoryHierarchy[];
  brandRefId: string;
  brandName: string;
  manufacturerRefId: string | null;
  manufacturerName: string | null;
  packerRefId: string | null;
  packerName: string | null;
  importerRefId: string | null;
  countryOfOriginRefId: string | null;
  countryOfOriginName: string | null;
  status: ProductStatus;
  rejectionReason: string | null;
  productInformation: IProductInformationItem[];
  expiresInMonths: number | null;
  subscriptionEnabled: boolean;
  /** Present on admin product responses when subscription config exists. */
  subscriptionConfig?: import('@modules/subscription/interfaces/product-subscription.interface').IProductSubscriptionConfig | null;
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
  sizeChart: IStorageFileReferenceResponse | null;
  /** Bundle-only icon. Null for non-bundle products. */
  bundleIcon: IStorageFileReferenceResponse | null;
  publishedAt: Date | null;
  /** Bundle-only: curated by (e.g. doctor names). Null for non-bundle products. */
  curatedBy: string | null;
  /** Bundle-only: curated for description. Null for non-bundle products. */
  curatedFor: string | null;
  attributes: IProductAttribute[];
  variants: IProductVariant[];
  media: IProductMedia[];
  healthConcernRefIds?: string[];
  wellnessGoalRefIds?: string[];
  wellnessGoals: IProductWellnessGoal[];
  categoryFilters: IProductCategoryFilterBinding[];
  tags: IProductTag[];
  faqs: IProductFaq[];
  bundleItems: IProductBundleItem[];
  /**
   * True when the product has no sellable stock:
   * no variants, or every variant has stock &lt;= 0.
   */
  outOfStock: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
