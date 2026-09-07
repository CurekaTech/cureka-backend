import { Injectable, Logger } from '@nestjs/common';
import {
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import {
  HomeSectionType,
  isCustomHomeSectionType,
} from '@modules/master/enums/home-section-type.enum';
import { IHomeSection } from '@modules/master/interfaces/home-section.interface';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { mapProductEntitiesToPublicCards } from '../mappers/public-product.mapper';
import { mapCategoryEntitiesToPublicListItems } from '../mappers/public-category.mapper';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import {
  HomepageSectionData,
  IHomepageSection,
  IHomepageSectionsResponse,
} from '../interfaces/homepage-section.interface';
import { HomepageService } from './homepage.service';

/** Full homepage sections response is cached for 60 minutes. */
const HOMEPAGE_SECTIONS_TTL_SECONDS = 60 * 60;

/**
 * Fixed storefront sections — always included in `/sections` data even when
 * retired from home_sections indexing.
 * High indexes keep footer-static blocks after indexed sections in the API array;
 * storefront layout still uses hardcoded FIXED / FOOTER order (not this index).
 */
const FIXED_HOMEPAGE_SECTIONS: Array<{
  type: HomeSectionType;
  title: string;
  slug: string;
  index: number;
}> = [
  {
    type: HomeSectionType.HERO_BANNER,
    title: 'Hero Banner',
    slug: 'hero-banner',
    index: 0,
  },
  {
    type: HomeSectionType.BUILT_BY_DOCTORS_BANNER,
    title: 'Built By Doctors Banner',
    slug: 'built-by-doctors-banner',
    index: 1,
  },
  {
    type: HomeSectionType.SHOP_BY_CATEGORY,
    title: 'Shop By Category',
    slug: 'shop-by-category',
    index: 2,
  },
  {
    type: HomeSectionType.BEST_SELLERS,
    title: 'Best Sellers',
    slug: 'best-sellers',
    index: 3,
  },
  {
    type: HomeSectionType.EXPERT_CURATED_BUNDLES,
    title: 'Expert Curated Bundles',
    slug: 'expert-curated-bundles',
    index: 4,
  },
  // Footer-static (above site footer) — not reorderable via indexing.
  {
    type: HomeSectionType.CURATED_WELLNESS_ESSENTIALS,
    title: 'Podcasts & Customer Reviews',
    slug: 'curated-wellness-essentials',
    index: 900,
  },
  {
    type: HomeSectionType.HEALTH_READS,
    title: 'Health Reads',
    slug: 'health-reads',
    index: 901,
  },
  {
    type: HomeSectionType.WATCH_AND_SHOP,
    title: 'Watch And Shop',
    slug: 'watch-and-shop',
    index: 902,
  },
];

type SectionMeta = {
  refId?: string;
  index: number;
  type: HomeSectionType;
  title: string;
  slug: string;
  source?: IHomeSection;
};

@Injectable()
export class HomepageSectionsService {
  private readonly logger = new Logger(HomepageSectionsService.name);

  /** Data loaders keyed by section type. Types without a loader return null data. */
  private readonly loaders: Partial<
    Record<HomeSectionType, () => Promise<HomepageSectionData>>
  > = {
    [HomeSectionType.HERO_BANNER]: () => this.homepageService.getHeroBannerSection(),
    [HomeSectionType.SHOP_BY_CATEGORY]: () => this.homepageService.getShopByCategoryTree(),
    [HomeSectionType.SHOP_BY_WELLNESS_GOALS]: () => this.homepageService.getShopByWellnessGoals(),
    [HomeSectionType.BRANDS_WE_TRUST]: () => this.homepageService.getBrandsWeTrust(),
    [HomeSectionType.EXPERT_CURATED_BUNDLES]: () => this.homepageService.getExpertCuratedBundles(),
    [HomeSectionType.FESTIVAL_BANNERS]: () => this.homepageService.getFestivalBanners(),
    [HomeSectionType.BRAND_BANNERS]: () => this.homepageService.getBrandBanners(),
    [HomeSectionType.BEST_SELLERS]: () => this.homepageService.getBestSellers(),
    [HomeSectionType.WATCH_AND_SHOP]: () => this.homepageService.getWatchAndShop(),
    [HomeSectionType.HEALTH_READS]: () => this.homepageService.getHealthReads(),
    [HomeSectionType.CURATED_WELLNESS_ESSENTIALS]: () =>
      this.homepageService.getCuratedWellnessEssentials(),
  };

  constructor(
    private readonly homepageService: HomepageService,
    private readonly homeSectionsService: HomeSectionsService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  /**
   * Returns every active home section (in configured index order). Sections whose
   * type has a registered loader carry rendered data; the rest carry `data: null`
   * so the storefront can lay them out and we can wire them up incrementally.
   *
   * When `requested` is a non-empty list, only those section types are included.
   */
  async getSections(requested?: HomepageSectionKey[]): Promise<IHomepageSectionsResponse> {
    const cached = await this.cacheStrategy.cacheAside({
      // v7: bestSellers uses findPublishedPaginated (fixes empty/500 section data).
      key: CacheKeys.homepage.sections(`v7-${this.buildVariantKey(requested)}`),
      module: CacheModuleName.HOMEPAGE,
      ttlSeconds: HOMEPAGE_SECTIONS_TTL_SECONDS,
      loader: () => this.buildSections(requested),
    });

    // Sign storage references AFTER the cache read so signed URLs (short-lived)
    // are never persisted in the long-lived sections cache.
    return this.storageUrlEnricher.enrichDeep(cached);
  }

  /**
   * Public detail for admin-created custom sections (product/category/banner).
   * Used by storefront "View all" listing pages.
   */
  async getCustomSectionBySlug(slug: string): Promise<IHomepageSection> {
    const section = await this.homeSectionsService.findActiveCustomBySlug(slug);
    const data = await this.loadCustomSectionData(section);
    const payload: IHomepageSection = {
      refId: section.refId,
      index: section.index,
      type: section.type,
      title: section.title,
      slug: section.slug,
      data,
    };

    // Include SEO fields on a shallow wrapper that enrichDeep can sign banners inside.
    const withSeo = {
      ...payload,
      pageTitle: section.pageTitle,
      pageDescription: section.pageDescription,
      pageCanonicalUrl: section.pageCanonicalUrl,
    };

    return this.storageUrlEnricher.enrichDeep(withSeo);
  }

  /** Stable cache-key suffix for the requested section filter combination. */
  private buildVariantKey(requested?: HomepageSectionKey[]): string {
    if (!requested?.length) return 'all';
    return [...new Set(requested)].sort().join(',');
  }

  private async buildSections(
    requested?: HomepageSectionKey[],
  ): Promise<IHomepageSectionsResponse> {
    const { sections } = await this.homeSectionsService.findActive();

    const metas: SectionMeta[] = sections.map((section) => ({
      refId: section.refId,
      index: section.index,
      type: section.type,
      title: section.title,
      slug: section.slug,
      source: section,
    }));

    const presentTypes = new Set(metas.map((section) => section.type));
    for (const fixed of FIXED_HOMEPAGE_SECTIONS) {
      if (!presentTypes.has(fixed.type)) {
        metas.push({
          index: fixed.index,
          type: fixed.type,
          title: fixed.title,
          slug: fixed.slug,
        });
      }
    }

    const requestedTypes = requested?.length
      ? new Set<string>(requested as unknown as string[])
      : null;

    const visibleSections = metas
      .filter((section) => (requestedTypes ? requestedTypes.has(section.type) : true))
      .sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));

    const built = await Promise.all(
      visibleSections.map(async (section): Promise<IHomepageSection> => {
        let data: HomepageSectionData | null = null;
        try {
          data = await this.resolveSectionData(section);
        } catch (error) {
          // Keep the rest of the homepage usable if one section loader fails.
          this.logger.error(
            `Failed to load section type=${section.type} slug=${section.slug}`,
            error instanceof Error ? error.stack : String(error),
          );
          data = null;
        }
        return {
          refId: section.refId,
          index: section.index,
          type: section.type,
          title: section.title,
          slug: section.slug,
          data,
        };
      }),
    );

    return { sections: built };
  }

  private async resolveSectionData(section: SectionMeta): Promise<HomepageSectionData | null> {
    if (isCustomHomeSectionType(section.type) && section.source) {
      return this.loadCustomSectionData(section.source);
    }

    const loader = this.loaders[section.type];
    return loader ? loader() : null;
  }

  private async loadCustomSectionData(
    section: IHomeSection,
  ): Promise<HomepageSectionData | null> {
    if (section.type === HomeSectionType.BANNER) {
      return { banners: section.banners ?? [] };
    }

    if (section.type === HomeSectionType.PRODUCT_SLIDER) {
      const refIds = section.productRefIds ?? [];
      const products = await this.productsRepository.findPublishedByRefIds(refIds);
      const byRefId = new Map(products.map((product) => [product.refId, product]));
      const ordered = refIds
        .map((refId) => byRefId.get(refId))
        .filter((product): product is NonNullable<typeof product> => Boolean(product));
      return {
        banner: section.banners?.[0] ?? null,
        products: mapProductEntitiesToPublicCards(ordered),
      };
    }

    if (section.type === HomeSectionType.CATEGORY_SLIDER) {
      const refIds = section.categoryRefIds ?? [];
      const categories = await this.categoriesRepository.findActiveByRefIds(refIds);
      const byRefId = new Map(categories.map((category) => [category.refId, category]));
      const ordered = refIds
        .map((refId) => byRefId.get(refId))
        .filter((category): category is NonNullable<typeof category> => Boolean(category));
      return {
        banner: section.banners?.[0] ?? null,
        categories: mapCategoryEntitiesToPublicListItems(ordered),
      };
    }

    return null;
  }
}
