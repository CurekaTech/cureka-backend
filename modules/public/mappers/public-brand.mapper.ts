import { BrandEntity } from '@modules/master/entities/brand.entity';
import { resolveBrandBannerForResponse } from '@modules/master/mappers/brand.mapper';
import { mapMasterFaqs } from '@modules/master/utils/master-faq.util';
import { IPublicBrandProductListingContext } from '../interfaces/public-brand.interface';
import { IPublicBrandListItem } from '../interfaces/public-master.interface';

export const mapBrandEntityToPublicListItem = (entity: BrandEntity): IPublicBrandListItem => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  logo: entity.logo,
});

export const mapBrandEntitiesToPublicListItems = (
  entities: BrandEntity[],
): IPublicBrandListItem[] => entities.map(mapBrandEntityToPublicListItem);

export const mapBrandEntityToListingContext = (
  entity: BrandEntity,
): IPublicBrandProductListingContext => ({
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  logo: entity.logo,
  banner: entity.showBanner === false ? null : resolveBrandBannerForResponse(entity),
  showBanner: entity.showBanner ?? true,
  video: entity.showVideo === false ? null : entity.video,
  showVideo: entity.showVideo ?? true,
  featuredBanner: entity.showFeaturedBanner === false ? null : entity.featuredBanner,
  showFeaturedBanner: entity.showFeaturedBanner ?? true,
  promotionalBanner: entity.showPromotionalBanner === false ? null : entity.promotionalBanner,
  showPromotionalBanner: entity.showPromotionalBanner ?? true,
  secondaryBanner: entity.showSecondaryBanner === false ? null : (entity.secondaryBanner ?? null),
  showSecondaryBanner: entity.showSecondaryBanner ?? true,
  secondaryVideo: entity.showSecondaryVideo === false ? null : (entity.secondaryVideo ?? null),
  showSecondaryVideo: entity.showSecondaryVideo ?? true,
  offerBanner: entity.showOfferBanner === false ? null : (entity.offerBanner ?? null),
  showOfferBanner: entity.showOfferBanner ?? true,
  faqBanner: entity.faqBanner ?? null,
  brandHighlights: entity.showBrandHighlights === false ? null : (entity.brandHighlights ?? null),
  showBrandHighlights: entity.showBrandHighlights ?? true,
  description: entity.showDescription === false ? null : entity.description,
  showDescription: entity.showDescription ?? true,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
  faqs: mapMasterFaqs(entity.faqs),
});
