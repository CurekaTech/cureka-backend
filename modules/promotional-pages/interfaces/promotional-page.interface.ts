import { IPublicCategoryListItem } from '@modules/public/interfaces/public-master.interface';
import { IPublicStorefrontProductCard } from '@modules/public/interfaces/public-product.interface';
import { IStorageFileReference } from '@packages/storage';
import { PaginatedResult } from '@packages/common';
import { PromotionalPageStatus } from '../enums/promotional-page-status.enum';
import { PromotionalSectionType } from '../enums/promotional-section-type.enum';
import { PromotionalTargetType } from '../enums/promotional-target-type.enum';
import { PromotionalSectionConfig } from '../utils/promotional-page-content.util';

export interface IPromotionalRefSummary {
  refId: string;
  name: string;
}

/** Display copy of an existing coupon. Checkout remains the pricing authority. */
export interface IPromotionalCouponSummary {
  refId: string;
  code: string;
  title: string;
  discountType: string;
  discountAmount: number;
  minPurchase: number;
  maxDiscount: number | null;
  startDate: Date;
  expiryDate: Date;
  applicabilityScope: string;
  status: string;
  products: IPromotionalRefSummary[];
  categories: IPromotionalRefSummary[];
  brands: IPromotionalRefSummary[];
}

export interface IPromotionalSectionItem {
  targetType: PromotionalTargetType;
  targetRefId: string;
  sortOrder: number;
}

export interface IPromotionalPageTarget {
  targetType: PromotionalTargetType;
  targetRefId: string;
  sortOrder: number;
}

export interface IAdminPromotionalSection {
  id: string;
  type: PromotionalSectionType;
  title: string | null;
  subtitle: string | null;
  config: PromotionalSectionConfig;
  sortOrder: number;
  isActive: boolean;
  startAt: Date | null;
  endAt: Date | null;
  items: IPromotionalSectionItem[];
}

export interface IAdminPromotionalPage {
  id: string;
  refId: string;
  name: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  /** Schedule-aware status. */
  status: PromotionalPageStatus;
  /** Value stored on the row. Expired can differ when the end date has passed. */
  storedStatus: PromotionalPageStatus;
  startAt: Date | null;
  endAt: Date | null;
  couponRefId: string | null;
  promotion: IPromotionalCouponSummary | null;
  sections: IAdminPromotionalSection[];
  targets: IPromotionalPageTarget[];
  seo: {
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
  };
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAdminPromotionalPageListItem {
  id: string;
  refId: string;
  name: string;
  slug: string;
  title: string;
  status: PromotionalPageStatus;
  storedStatus: PromotionalPageStatus;
  startAt: Date | null;
  endAt: Date | null;
  sectionCount: number;
  couponRefId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type IAdminPromotionalPageList = PaginatedResult<IAdminPromotionalPageListItem>;

export interface IPublicBrandCard {
  refId: string;
  name: string;
  slug: string;
  description: string | null;
  logo: IStorageFileReference | null;
  logoAltText: string | null;
  permalink: string | null;
}

export interface IPublicBlogCard {
  refId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: IStorageFileReference | null;
  featuredImageAltText: string | null;
  permalink: string | null;
  isFeatured: boolean;
  isTrending: boolean;
}

export interface IPublicPromotionalSection {
  id: string;
  type: PromotionalSectionType;
  title: string | null;
  subtitle: string | null;
  config: PromotionalSectionConfig;
  sortOrder: number;
  isActive: boolean;
  isCurrentlyVisible: boolean;
  startAt: Date | null;
  endAt: Date | null;
  products: IPublicStorefrontProductCard[];
  categories: IPublicCategoryListItem[];
  brands: IPublicBrandCard[];
  blogs: IPublicBlogCard[];
}

export interface IPublicPromotionalTargets {
  products: IPublicStorefrontProductCard[];
  categories: IPublicCategoryListItem[];
  brands: IPublicBrandCard[];
}

export interface IPublicPromotionalPage {
  id: string;
  refId: string;
  name: string;
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: PromotionalPageStatus;
  startAt: Date | null;
  endAt: Date | null;
  sections: IPublicPromotionalSection[];
  targets: IPublicPromotionalTargets;
  promotion: IPromotionalCouponSummary | null;
  seo: {
    title: string;
    metaTitle: string | null;
    metaDescription: string | null;
  };
  preview?: boolean;
}
