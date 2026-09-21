import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  CacheKeys,
  CacheModuleName,
  CacheService,
  CacheStrategyService,
  RedisConnectionService,
} from '@packages/cache';
import { EVENTS } from '@packages/events';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import {
  HomeSectionType,
  isCustomHomeSectionType,
} from '@modules/master/enums/home-section-type.enum';
import { IHomeSection } from '@modules/master/interfaces/home-section.interface';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { mapProductEntitiesToPublicStorefrontCards } from '../mappers/public-product.mapper';
import { mapCategoryEntitiesToPublicListItems } from '../mappers/public-category.mapper';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import {
  HomepageSectionData,
  IHomepageSection,
  IHomepageSectionsResponse,
} from '../interfaces/homepage-section.interface';
import { HomepageService } from './homepage.service';

/** Unsigned section payload (no signed URLs) — long TTL; rebuilt on CMS/product invalidation. */
const HOMEPAGE_SECTIONS_TTL_SECONDS = 60 * 60;

/**
 * Enriched (signed-URL) payload cache.
 * Safe while GCS_SIGNED_URL_TTL_SECONDS ≫ this window (typically 24h).
 * Short enough that admin edits appear within a few minutes after Redis invalidation
 * (L1 clears immediately via invalidateLocalCache).
 */
const HOMEPAGE_SECTIONS_ENRICHED_TTL_SECONDS = 5 * 60;

/** Process-local hot cache — skips Upstash Redis + GCS signing on repeat hits. */
const HOMEPAGE_SECTIONS_L1_TTL_MS = 60 * 1000;

type SectionsCacheLayer = 'l1' | 'enriched_redis' | 'unsigned_rebuild';

type SectionsHitCounters = {
  total: number;
  l1: number;
  enrichedRedis: number;
  unsignedRebuild: number;
};

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
export class HomepageSectionsService implements OnModuleInit {
  private readonly logger = new Logger(HomepageSectionsService.name);

  /** Hot in-process cache of fully enriched responses (per worker). */
  private readonly enrichedL1 = new Map<
    string,
    { expiresAt: number; value: IHomepageSectionsResponse }
  >();

  /** Process-lifetime counters for cache-layer hit rates (logged on each request). */
  private readonly hitCounters: SectionsHitCounters = {
    total: 0,
    l1: 0,
    enrichedRedis: 0,
    unsignedRebuild: 0,
  };

  /** Data loaders keyed by section type. Types without a loader return null data. */
  private readonly loaders: Partial<
    Record<HomeSectionType, () => Promise<HomepageSectionData>>
  > = {
    [HomeSectionType.SHOP_BY_CATEGORY]: () => this.homepageService.getShopByCategoryTree(),
    [HomeSectionType.SHOP_BY_WELLNESS_GOALS]: () => this.homepageService.getShopByWellnessGoals(),
    [HomeSectionType.HEALTH_CONCERNS]: () => this.homepageService.getHomePageHealthConcernsCached(),
    [HomeSectionType.BRANDS_WE_TRUST]: () => this.homepageService.getBrandsWeTrust(),
    [HomeSectionType.EXPERT_CURATED_BUNDLES]: () =>
      this.homepageService.getExpertCuratedBundlesCached(),
    [HomeSectionType.BEST_SELLERS]: () => this.homepageService.getBestSellers(),
    [HomeSectionType.WATCH_AND_SHOP]: () => this.homepageService.getWatchAndShop(),
    [HomeSectionType.HEALTH_READS]: () => this.homepageService.getHealthReads(),
    [HomeSectionType.CURATED_WELLNESS_ESSENTIALS]: () =>
      this.homepageService.getCuratedWellnessEssentials(),
  };

  private static readonly BANNER_SECTION_TYPES = new Set<HomeSectionType>([
    HomeSectionType.HERO_BANNER,
    HomeSectionType.FESTIVAL_BANNERS,
    HomeSectionType.BRAND_BANNERS,
  ]);

  constructor(
    private readonly homepageService: HomepageService,
    private readonly homeSectionsService: HomeSectionsService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly cacheService: CacheService,
    private readonly redisConnection: RedisConnectionService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  onModuleInit(): void {
    // Warm unsigned + enriched caches so the first storefront request is hot.
    setImmediate(() => {
      void this.getSections().catch((error) => {
        this.logger.warn(
          `Homepage sections cache warm failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    });
  }

  /** Drop process-local enriched cache (call alongside Redis sections invalidation). */
  invalidateLocalCache(): void {
    this.enrichedL1.clear();
  }

  @OnEvent(EVENTS.HOME_SECTION_UPDATED)
  onHomeSectionUpdated(): void {
    this.invalidateLocalCache();
  }

  /**
   * Returns every active home section (in configured index order). Sections whose
   * type has a registered loader carry rendered data; the rest carry `data: null`
   * so the storefront can lay them out and we can wire them up incrementally.
   *
   * When `requested` is a non-empty list, only those section types are included.
   *
   * Hot path: L1 (memory) → enriched Redis → unsigned Redis + sign URLs.
   */
  async getSections(requested?: HomepageSectionKey[]): Promise<IHomepageSectionsResponse> {
    const startedAt = Date.now();
    const variant = this.buildVariantKey(requested);

    const l1 = this.enrichedL1.get(variant);
    if (l1 && l1.expiresAt > Date.now()) {
      this.logSectionsTiming('l1', variant, startedAt, 0);
      return l1.value;
    }

    const enrichedKey = CacheKeys.homepage.sections(`v12-enriched-${variant}`);
    const fromEnriched = await this.cacheService.get<IHomepageSectionsResponse>(enrichedKey);
    if (fromEnriched) {
      this.setL1(variant, fromEnriched);
      this.logSectionsTiming('enriched_redis', variant, startedAt, 0);
      return fromEnriched;
    }

    const unsigned = await this.cacheStrategy.cacheAside({
      // v11: slim storefront cards + shop-by-category tiles; URLs signed after this read.
      key: CacheKeys.homepage.sections(`v11-${variant}`),
      module: CacheModuleName.HOMEPAGE,
      ttlSeconds: HOMEPAGE_SECTIONS_TTL_SECONDS,
      loader: () => this.buildSections(requested),
    });

    const signStartedAt = Date.now();
    const enriched = await this.storageUrlEnricher.enrichDeep(unsigned);
    const enrichMs = Date.now() - signStartedAt;
    await this.cacheService.set(
      enrichedKey,
      enriched,
      HOMEPAGE_SECTIONS_ENRICHED_TTL_SECONDS,
    );
    this.setL1(variant, enriched);
    this.logSectionsTiming('unsigned_rebuild', variant, startedAt, enrichMs);
    return enriched;
  }

  private logSectionsTiming(
    cacheLayer: SectionsCacheLayer,
    variant: string,
    startedAt: number,
    enrichMs: number,
  ): void {
    this.hitCounters.total += 1;
    if (cacheLayer === 'l1') this.hitCounters.l1 += 1;
    else if (cacheLayer === 'enriched_redis') this.hitCounters.enrichedRedis += 1;
    else this.hitCounters.unsignedRebuild += 1;

    const total = this.hitCounters.total;
    const l1HitRate = total > 0 ? this.hitCounters.l1 / total : 0;
    const enrichedHitRate = total > 0 ? this.hitCounters.enrichedRedis / total : 0;

    this.logger.log({
      msg: 'homepage_sections_timing',
      variant,
      cacheLayer,
      totalMs: Date.now() - startedAt,
      enrichMs,
      redisAvailable: this.redisConnection.isAvailable(),
      l1HitRate: Number(l1HitRate.toFixed(3)),
      enrichedHitRate: Number(enrichedHitRate.toFixed(3)),
      requestsSinceBoot: total,
    });
  }

  private setL1(variant: string, value: IHomepageSectionsResponse): void {
    this.enrichedL1.set(variant, {
      expiresAt: Date.now() + HOMEPAGE_SECTIONS_L1_TTL_MS,
      value,
    });
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

    // Injected only when explicitly requested so the default `/sections` payload
    // stays unchanged. Mobile homepage uses GET /homepage/health-concerns or
    // GET /homepage/sections?healthConcerns=true.
    if (
      requestedTypes?.has(HomeSectionType.HEALTH_CONCERNS) &&
      !presentTypes.has(HomeSectionType.HEALTH_CONCERNS)
    ) {
      metas.push({
        index: 5,
        type: HomeSectionType.HEALTH_CONCERNS,
        title: 'Health Concerns',
        slug: 'health-concerns',
      });
    }

    const visibleSections = metas
      .filter((section) => (requestedTypes ? requestedTypes.has(section.type) : true))
      .sort((a, b) => a.index - b.index || a.type.localeCompare(b.type));

    const needsBanners = visibleSections.some((section) =>
      HomepageSectionsService.BANNER_SECTION_TYPES.has(section.type),
    );
    const bannerBundle = needsBanners
      ? await this.homepageService.loadHomepageBannerReferences()
      : null;

    const built = await Promise.all(
      visibleSections.map(async (section): Promise<IHomepageSection> => {
        let data: HomepageSectionData | null = null;
        try {
          data = await this.resolveSectionData(section, bannerBundle);
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

  private async resolveSectionData(
    section: SectionMeta,
    bannerBundle: Awaited<
      ReturnType<HomepageService['loadHomepageBannerReferences']>
    > | null,
  ): Promise<HomepageSectionData | null> {
    if (bannerBundle) {
      if (section.type === HomeSectionType.HERO_BANNER) {
        return {
          primary: bannerBundle.hero.primary,
          secondary: bannerBundle.hero.secondary,
        };
      }
      if (section.type === HomeSectionType.FESTIVAL_BANNERS) {
        return bannerBundle.mainPromo;
      }
      if (section.type === HomeSectionType.BRAND_BANNERS) {
        return { left: bannerBundle.brandWise.left, right: bannerBundle.brandWise.right };
      }
    }

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
        products: mapProductEntitiesToPublicStorefrontCards(ordered),
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
