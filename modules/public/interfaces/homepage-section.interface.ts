import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { HomeSectionBannerItem } from '@modules/master/entities/home-section.entity';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { IPublicBestSellersSection } from './public-best-sellers.interface';
import {
  IPublicBrandBannersSection,
  IPublicHeroBannerSection,
} from './public-banner-section.interface';
import { IPublicBrandCard } from './public-brand.interface';
import { IPublicShopByCategoryTile } from './public-category.interface';
import {
  IPublicHealthConcernCard,
  IPublicHomePageHealthConcern,
} from './public-health-concern.interface';
import { IPublicStorefrontProductCard } from './public-product.interface';
import { IPublicWellnessGoalCard } from './public-wellness-goal.interface';
import { IPublicWatchAndShopSection } from './public-watch-and-shop.interface';
import { IPublicHealthReadsSection } from './public-health-reads.interface';
import { IPublicCuratedWellnessEssentialsSection } from './public-expert-talk.interface';
import { IPublicCategoryListItem } from './public-master.interface';

export type IPublicCustomBannerSection = {
  banners: HomeSectionBannerItem[];
};

export type IPublicProductSliderSection = {
  /** Optional section promo banner (desktop + optional mobile). */
  banner: HomeSectionBannerItem | null;
  products: IPublicStorefrontProductCard[];
};

export type IPublicCategorySliderSection = {
  /** Optional section promo banner (desktop + optional mobile). */
  banner: HomeSectionBannerItem | null;
  categories: IPublicCategoryListItem[];
};

export type HomepageSectionDataMap = {
  [HomepageSectionKey.HERO_BANNER]: IPublicHeroBannerSection;
  [HomepageSectionKey.SHOP_BY_CATEGORY]: IPublicShopByCategoryTile[];
  [HomepageSectionKey.SHOP_BY_WELLNESS_GOALS]: IPublicWellnessGoalCard[];
  [HomepageSectionKey.HEALTH_CONCERNS]: IPublicHomePageHealthConcern[];
  [HomepageSectionKey.BRANDS_WE_TRUST]: IPublicBrandCard[];
  [HomepageSectionKey.EXPERT_CURATED_BUNDLES]: IPublicHealthConcernCard[];
  [HomepageSectionKey.FESTIVAL_BANNERS]: IStorefrontBannerItem[];
  [HomepageSectionKey.BRAND_BANNERS]: IPublicBrandBannersSection;
  [HomepageSectionKey.BEST_SELLERS]: IPublicBestSellersSection;
  [HomepageSectionKey.WATCH_AND_SHOP]: IPublicWatchAndShopSection;
  [HomepageSectionKey.HEALTH_READS]: IPublicHealthReadsSection;
  [HomepageSectionKey.FEATURED_PRODUCTS]: IPublicStorefrontProductCard[];
  [HomepageSectionKey.BANNER]: IPublicCustomBannerSection;
  [HomepageSectionKey.PRODUCT_SLIDER]: IPublicProductSliderSection;
  [HomepageSectionKey.CATEGORY_SLIDER]: IPublicCategorySliderSection;
};

export type HomepageSectionsResponse = Partial<HomepageSectionDataMap>;

/** Any section data payload the storefront may render. */
export type HomepageSectionData =
  | HomepageSectionDataMap[HomepageSectionKey]
  | IPublicCuratedWellnessEssentialsSection;

/** One ordered homepage section envelope: metadata + (optional) rendered data. */
export interface IHomepageSection {
  refId?: string;
  index: number;
  type: HomeSectionType;
  title: string;
  slug: string;
  data: HomepageSectionData | null;
}

export interface IHomepageSectionsResponse {
  sections: IHomepageSection[];
}
