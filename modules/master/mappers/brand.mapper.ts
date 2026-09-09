import { BrandEntity } from '../entities/brand.entity';
import { IBrand } from '../interfaces/brand.interface';

/** Hide soft-deleted banner from API consumers; DB/GCS values stay intact. */
export const resolveBrandBannerForResponse = (
  entity: Pick<BrandEntity, 'banner' | 'bannerDeletedAt'>,
): BrandEntity['banner'] => (entity.bannerDeletedAt ? null : entity.banner);

export const mapBrandEntityToResponse = (entity: BrandEntity): IBrand =>
  ({
    id: entity.id,
    refId: entity.refId,
    name: entity.name,
    slug: entity.slug,
    logo: entity.logo,
    banner: resolveBrandBannerForResponse(entity),
    showBanner: entity.showBanner ?? true,
    video: entity.video,
    showVideo: entity.showVideo ?? true,
    featuredBanner: entity.featuredBanner,
    showFeaturedBanner: entity.showFeaturedBanner ?? true,
    promotionalBanner: entity.promotionalBanner,
    showPromotionalBanner: entity.showPromotionalBanner ?? true,
    secondaryBanner: entity.secondaryBanner ?? null,
    showSecondaryBanner: entity.showSecondaryBanner ?? true,
    secondaryVideo: entity.secondaryVideo ?? null,
    showSecondaryVideo: entity.showSecondaryVideo ?? true,
    offerBanner: entity.offerBanner ?? null,
    showOfferBanner: entity.showOfferBanner ?? true,
    brandHighlights: entity.brandHighlights ?? null,
    showBrandHighlights: entity.showBrandHighlights ?? true,
    description: entity.description,
    showDescription: entity.showDescription ?? true,
    status: entity.status,
    inHomePage: entity.inHomePage,
    metaTitle: entity.metaTitle,
    metaDescription: entity.metaDescription,
    metaKeywords: entity.metaKeywords,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  }) as IBrand;

export const mapBrandEntitiesToResponse = (entities: BrandEntity[]): IBrand[] =>
  entities.map(mapBrandEntityToResponse);
