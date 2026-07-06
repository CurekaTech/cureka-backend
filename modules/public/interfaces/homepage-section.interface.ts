import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import { IPublicCategoryTree } from './public-category.interface';
import { IPublicProductCard } from './public-product.interface';
import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { IStorageFileReferenceResponse } from '@packages/storage';

export type HomepageSectionDataMap = {
  [HomepageSectionKey.SHOP_BY_CATEGORY]: IPublicCategoryTree[];
  [HomepageSectionKey.FEATURED_PRODUCTS]: IPublicProductCard[];
};

export type HomepageSectionsResponse = Partial<HomepageSectionDataMap>;

export interface IHomepageBestSellersCategory {
  index: number;
  refId: string;
  name: string;
  slug: string;
  products: IPublicProductCard[];
}

export interface IHomepageBestSellersSectionData {
  categories: IHomepageBestSellersCategory[];
}

export interface IHomepageBrandBannersSectionData {
  left: IStorefrontBannerItem[];
  right: IStorefrontBannerItem[];
}

export interface IHomepageHeroBannerSectionData {
  primary: IStorefrontBannerItem[];
  secondary: IStorefrontBannerItem[];
}

export interface IHomepageExpertCuratedBundle {
  refId: string;
  name: string;
  slug: string;
  description: string;
  icon: IStorageFileReferenceResponse | null;
}

export type HomepageActiveSectionData =
  | null
  | IPublicCategoryTree[]
  | IHomepageBestSellersSectionData
  | IStorefrontBannerItem[]
  | IHomepageBrandBannersSectionData
  | IHomepageHeroBannerSectionData
  | IHomepageExpertCuratedBundle[];

export interface IHomepageActiveSection {
  index: number;
  type: HomeSectionType;
  title: string;
  slug: string;
  data: HomepageActiveSectionData;
}

export interface IHomepageActiveSectionsResponse {
  sections: IHomepageActiveSection[];
}
