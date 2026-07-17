import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';
import { IProductInformationItem } from './product-information.interface';
import { IProductPackMetadataItem } from './product-pack-metadata.interface';

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
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subSubCategoryRefId: string | null;
  subSubSubCategoryRefId: string | null;
  brandRefId: string;
  brandName: string;
  manufacturerRefId: string | null;
  packerRefId: string | null;
  importerRefId: string | null;
  countryOfOriginRefId: string | null;
  countryOfOriginName: string | null;
  status: ProductStatus;
  rejectionReason: string | null;
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
  sizeChart: IStorageFileReferenceResponse | null;
  publishedAt: Date | null;
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
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
