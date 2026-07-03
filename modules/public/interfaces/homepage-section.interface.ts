import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { IPublicBestSellersSection } from './public-best-sellers.interface';
import {
  IPublicBrandBannersSection,
  IPublicHeroBannerSection,
} from './public-banner-section.interface';
import { IPublicBrandCard } from './public-brand.interface';
import { IPublicCategoryTree } from './public-category.interface';
import { IPublicHealthConcernCard } from './public-health-concern.interface';
import { IPublicProductCard } from './public-product.interface';
import { IPublicWellnessGoalCard } from './public-wellness-goal.interface';

export type HomepageSectionDataMap = {
  [HomepageSectionKey.HERO_BANNER]: IPublicHeroBannerSection;
  [HomepageSectionKey.SHOP_BY_CATEGORY]: IPublicCategoryTree[];
  [HomepageSectionKey.SHOP_BY_WELLNESS_GOALS]: IPublicWellnessGoalCard[];
  [HomepageSectionKey.BRANDS_WE_TRUST]: IPublicBrandCard[];
  [HomepageSectionKey.EXPERT_CURATED_BUNDLES]: IPublicHealthConcernCard[];
  [HomepageSectionKey.FESTIVAL_BANNERS]: IStorefrontBannerItem[];
  [HomepageSectionKey.BRAND_BANNERS]: IPublicBrandBannersSection;
  [HomepageSectionKey.BEST_SELLERS]: IPublicBestSellersSection;
  [HomepageSectionKey.FEATURED_PRODUCTS]: IPublicProductCard[];
};

export type HomepageSectionsResponse = Partial<HomepageSectionDataMap>;

/** Any section data payload the storefront may render. */
export type HomepageSectionData = HomepageSectionDataMap[HomepageSectionKey];

/** One ordered homepage section envelope: metadata + (optional) rendered data. */
export interface IHomepageSection {
  index: number;
  type: HomeSectionType;
  title: string;
  slug: string;
  data: HomepageSectionData | null;
}

export interface IHomepageSectionsResponse {
  sections: IHomepageSection[];
}
