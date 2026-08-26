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
    video: entity.video,
    featuredBanner: entity.featuredBanner,
    promotionalBanner: entity.promotionalBanner,
    secondaryBanner: entity.secondaryBanner ?? null,
    secondaryVideo: entity.secondaryVideo ?? null,
    offerBanner: entity.offerBanner ?? null,
    brandHighlights: entity.brandHighlights ?? null,
    description: entity.description,
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
