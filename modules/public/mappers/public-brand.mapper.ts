import { BrandEntity } from '@modules/master/entities/brand.entity';
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
  banner: entity.banner,
  video: entity.video,
  featuredBanner: entity.featuredBanner,
  promotionalBanner: entity.promotionalBanner,
  secondaryBanner: entity.secondaryBanner ?? null,
  secondaryVideo: entity.secondaryVideo ?? null,
  brandHighlights: entity.brandHighlights ?? null,
  description: entity.description,
  metaTitle: entity.metaTitle,
  metaDescription: entity.metaDescription,
  metaKeywords: entity.metaKeywords,
});
