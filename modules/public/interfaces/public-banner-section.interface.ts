import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';

/** Hero Banner section: primary + secondary hero banners. */
export interface IPublicHeroBannerSection {
  primary: IStorefrontBannerItem[];
  secondary: IStorefrontBannerItem[];
}

/** Brand Banners section: left + right slots (brand-wise placement). */
export interface IPublicBrandBannersSection {
  left: IStorefrontBannerItem[];
  right: IStorefrontBannerItem[];
}
