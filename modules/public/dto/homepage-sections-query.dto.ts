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
  featuredProducts?: boolean;
}

export const resolveHomepageSectionsFromFlags = (
  query: HomepageSectionsQueryDto,
): HomepageSectionKey[] | undefined => {
  const flags: Array<[HomepageSectionKey, boolean | undefined]> = [
    [HomepageSectionKey.HERO_BANNER, query.heroBanner],
    [HomepageSectionKey.SHOP_BY_CATEGORY, query.shopByCategory],
    [HomepageSectionKey.SHOP_BY_WELLNESS_GOALS, query.shopByWellnessGoals],
    [HomepageSectionKey.BRANDS_WE_TRUST, query.brandsWeTrust],
    [HomepageSectionKey.FESTIVAL_BANNERS, query.festivalBanners],
    [HomepageSectionKey.BRAND_BANNERS, query.brandBanners],
    [HomepageSectionKey.BEST_SELLERS, query.bestSellers],
    [HomepageSectionKey.FEATURED_PRODUCTS, query.featuredProducts],
  ];

  const enabled = flags.filter(([, isEnabled]) => isEnabled === true).map(([key]) => key);
  if (enabled.length > 0) return enabled;

  const hasAnyFlag = flags.some(([, isEnabled]) => isEnabled !== undefined);
  return hasAnyFlag ? [] : undefined;
};
