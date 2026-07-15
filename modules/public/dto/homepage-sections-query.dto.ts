import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { HomepageSectionKey } from '../enums/homepage-section.enum';

const parseBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return undefined;
};

export class HomepageSectionsQueryDto {
  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  heroBanner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  shopByCategory?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  shopByWellnessGoals?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  brandsWeTrust?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  expertCuratedBundles?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  festivalBanners?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  brandBanners?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  bestSellers?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  watchAndShop?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  healthReads?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  featuredProducts?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  banner?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  productSlider?: boolean;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  categorySlider?: boolean;
}

export const resolveHomepageSectionsFromFlags = (
  query: HomepageSectionsQueryDto,
): HomepageSectionKey[] | undefined => {
  const flags: Array<[HomepageSectionKey, boolean | undefined]> = [
    [HomepageSectionKey.HERO_BANNER, query.heroBanner],
    [HomepageSectionKey.SHOP_BY_CATEGORY, query.shopByCategory],
    [HomepageSectionKey.SHOP_BY_WELLNESS_GOALS, query.shopByWellnessGoals],
    [HomepageSectionKey.BRANDS_WE_TRUST, query.brandsWeTrust],
    [HomepageSectionKey.EXPERT_CURATED_BUNDLES, query.expertCuratedBundles],
    [HomepageSectionKey.FESTIVAL_BANNERS, query.festivalBanners],
    [HomepageSectionKey.BRAND_BANNERS, query.brandBanners],
    [HomepageSectionKey.BEST_SELLERS, query.bestSellers],
    [HomepageSectionKey.WATCH_AND_SHOP, query.watchAndShop],
    [HomepageSectionKey.HEALTH_READS, query.healthReads],
    [HomepageSectionKey.FEATURED_PRODUCTS, query.featuredProducts],
    [HomepageSectionKey.BANNER, query.banner],
    [HomepageSectionKey.PRODUCT_SLIDER, query.productSlider],
    [HomepageSectionKey.CATEGORY_SLIDER, query.categorySlider],
  ];

  const enabled = flags.filter(([, isEnabled]) => isEnabled === true).map(([key]) => key);
  if (enabled.length > 0) return enabled;

  const hasAnyFlag = flags.some(([, isEnabled]) => isEnabled !== undefined);
  return hasAnyFlag ? [] : undefined;
};
