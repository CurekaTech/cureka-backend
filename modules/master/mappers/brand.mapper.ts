import { BrandEntity } from '../entities/brand.entity';
import { IBrand } from '../interfaces/brand.interface';
import { mapMasterFaqs } from '../utils/master-faq.util';

/** Hide soft-deleted banner from API consumers; DB/GCS values stay intact. */
export const resolveBrandBannerForResponse = (
  entity: Pick<BrandEntity, 'banner' | 'bannerDeletedAt'>,
): BrandEntity['banner'] => (entity.bannerDeletedAt ? null : entity.banner);

export const mapBrandEntityToResponse = (entity: BrandEntity): IBrand =>
  ({
    id: entity.id,
    refId: entity.refId,
    name: entity.name,
    skuCode: entity.skuCode,
    slug: entity.slug,
    logo: entity.logo,
    logoAltText: entity.logoAltText ?? null,
    banner: resolveBrandBannerForResponse(entity),
    bannerAltText: entity.bannerDeletedAt ? null : (entity.bannerAltText ?? null),
    showBanner: entity.showBanner ?? true,
    video: entity.video,
    showVideo: entity.showVideo ?? true,
    featuredBanner: entity.featuredBanner,
    featuredBannerAltText: entity.featuredBannerAltText ?? null,
    showFeaturedBanner: entity.showFeaturedBanner ?? true,
    promotionalBanner: entity.promotionalBanner,
    promotionalBannerAltText: entity.promotionalBannerAltText ?? null,
    showPromotionalBanner: entity.showPromotionalBanner ?? true,
    secondaryBanner: entity.secondaryBanner ?? null,
    secondaryBannerAltText: entity.secondaryBannerAltText ?? null,
    showSecondaryBanner: entity.showSecondaryBanner ?? true,
    secondaryVideo: entity.secondaryVideo ?? null,
    showSecondaryVideo: entity.showSecondaryVideo ?? true,
    offerBanner: entity.offerBanner ?? null,
    offerBannerAltText: entity.offerBannerAltText ?? null,
    showOfferBanner: entity.showOfferBanner ?? true,
    faqBanner: entity.faqBanner ?? null,
    faqBannerAltText: entity.faqBannerAltText ?? null,
    brandHighlights: entity.brandHighlights ?? null,
    showBrandHighlights: entity.showBrandHighlights ?? true,
    description: entity.description,
    listingHeading: entity.listingHeading ?? null,
    showDescription: entity.showDescription ?? true,
    status: entity.status,
    inHomePage: entity.inHomePage,
    metaTitle: entity.metaTitle,
    metaDescription: entity.metaDescription,
    metaKeywords: entity.metaKeywords,
    faqs: mapMasterFaqs(entity.faqs),
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  }) as IBrand;

export const mapBrandEntitiesToResponse = (entities: BrandEntity[]): IBrand[] =>
  entities.map(mapBrandEntityToResponse);
