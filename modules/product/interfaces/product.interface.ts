import { ProductType } from '../enums/product-type.enum';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductMediaType } from '../enums/product-media-type.enum';
import { VariantStatus } from '../enums/variant-status.enum';

export interface IVariantAttributeValue {
  attributeRefId: string;
  attributeName: string;
  value: string;
}

export interface IProductVariant {
  id: string;
  sku: string;
  vendorSku: string | null;
  barcode: string | null;
  mrp: number;
  sellingPrice: number;
  discountPercentage: number | null;
  stock: number;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  expiresIn: number | null;
  status: VariantStatus;
  combinationKey: string | null;
  attributes: IVariantAttributeValue[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductMedia {
  id: string;
  type: ProductMediaType;
  url: string;
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

export interface IProduct {
  id: string;
  refId: string;
  vendorId: string | null;
  name: string;
  slug: string;
  description: string | null;
  productType: ProductType;
  productNatureRefId: string;
  productNatureName: string;
  categoryRefId: string;
  categoryName: string;
  subCategoryRefId: string | null;
  subSubCategoryRefId: string | null;
  subSubSubCategoryRefId: string | null;
  brandRefId: string | null;
  manufacturerRefId: string | null;
  packerRefId: string | null;
  importerRefId: string | null;
  status: ProductStatus;
  creationStep: number;
  rejectionReason: string | null;
  subscriptionEnabled: boolean;
  codAvailable: boolean;
  emiAvailable: boolean;
  replaceAllowed: boolean;
  replaceWindowDays: number | null;
  returnWindowDays: number | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  publishedAt: Date | null;
  variants: IProductVariant[];
  media: IProductMedia[];
  healthConcernRefIds: string[];
  tags: IProductTag[];
  faqs: IProductFaq[];
  bundleItems: IProductBundleItem[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
