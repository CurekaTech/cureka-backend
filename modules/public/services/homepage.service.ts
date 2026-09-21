import { Injectable, Logger } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
  PaginationOptions,
} from '@packages/common';
import {
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { BannersService } from '@modules/master/services/banners.service';
import { WatchAndShopService } from '@modules/master/services/watch-and-shop.service';
import { ExpertTalkService } from '@modules/master/services/expert-talk.service';
import { TestimonialService } from '@modules/master/services/testimonial.service';
import { IHomepageBannersBundle, IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { isHomepageShopByHierarchyLevel } from '@modules/master/constants/homepage-shop-by-hierarchy.constant';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { WellnessGoalsRepository } from '@modules/master/repositories/wellness-goals.repository';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { IPublicBestSellersSection } from '../interfaces/public-best-sellers.interface';
import { IPublicWatchAndShopItem, IPublicWatchAndShopSection } from '../interfaces/public-watch-and-shop.interface';
import { IPublicHealthReadsSection } from '../interfaces/public-health-reads.interface';
import { IPublicCuratedWellnessEssentialsSection } from '../interfaces/public-expert-talk.interface';
import { BlogPostsService } from '@modules/master/services/blog-posts.service';
import { CmsPagesService } from '@modules/master/services/cms-pages.service';
import { IPublicCmsPagesByKey } from '@modules/master/interfaces/cms-page.interface';
import {
  IPublicBrandBannersSection,
  IPublicHeroBannerSection,
} from '../interfaces/public-banner-section.interface';
import { IPublicBrandCard } from '../interfaces/public-brand.interface';
import { IPublicHealthConcernCard, IPublicHomePageHealthConcern } from '../interfaces/public-health-concern.interface';
import {
  IPublicHeaderCategory,
  IPublicShopByCategoryTile,
} from '../interfaces/public-category.interface';
import { IPublicFooterNav } from '../interfaces/public-footer.interface';
import { IPublicWellnessGoalCard } from '../interfaces/public-wellness-goal.interface';
import { mapCategoryEntityToShopByTile, mapHeaderCategoryEntity } from '../mappers/public-category.mapper';
import { mapProductEntitiesToPublicStorefrontCards } from '../mappers/public-product.mapper';
import {
  HOMEPAGE_SECTION_PREVIEW_LIMIT,
  HOMEPAGE_TESTIMONIALS_PREVIEW_LIMIT,
  HOMEPAGE_WATCH_AND_SHOP_PREVIEW_LIMIT,
} from '../constants/homepage-section-preview-limit.constant';

/** Max products returned per Best Sellers category tab in the homepage section. */
const BEST_SELLERS_PRODUCTS_PER_CATEGORY = 5;

/** Max category tabs shown in the homepage Best Sellers section (CMS index order). */
const BEST_SELLERS_MAX_CATEGORIES = 10;

/**
 * Tag slug that marks a product as a best seller. Only root categories containing at
 * least one published product with this tag appear in the Best Sellers section.
 */
const BEST_SELLERS_TAG_SLUG = 'bestsellers';

/** Max wellness goals shown in the homepage "Shop by Wellness Goals" section. */
const SHOP_BY_WELLNESS_GOALS_LIMIT = 10;

/** Max brands shown in the homepage "Brands We Trust" section. */
const BRANDS_WE_TRUST_LIMIT = 10;

/** Max health concerns shown in the homepage "Expert-Curated Wellness Bundles" section. */
const EXPERT_CURATED_BUNDLES_LIMIT = 10;

/** Footer chrome link caps. */
const FOOTER_CATEGORY_LIMIT = 8;
const FOOTER_BRAND_LIMIT = 8;

/** Process-local hot cache TTL for header tree / footer nav. */
const CHROME_L1_TTL_MS = 60 * 1000;

@Injectable()
export class HomepageService {
  private readonly logger = new Logger(HomepageService.name);

  private headerTreeL1: { expiresAt: number; value: IPublicHeaderCategory[] } | null = null;
  private footerNavL1: { expiresAt: number; value: IPublicFooterNav } | null = null;

  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly bannersService: BannersService,
    private readonly watchAndShopService: WatchAndShopService,
    private readonly expertTalkService: ExpertTalkService,
    private readonly testimonialService: TestimonialService,
    private readonly blogPostsService: BlogPostsService,
    private readonly cmsPagesService: CmsPagesService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}
  getHomepageBanners(): Promise<IHomepageBannersBundle> {
    return this.bannersService.getHomepageBanners();
  }

  /** Cached predefined CMS pages bundle for storefront footer / legal links. */
  getPublicCmsPages(): Promise<IPublicCmsPagesByKey> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.cmsPages(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.cmsPagesService.findPublicPagesByKey(),
    });
  }

  /** Used by cache invalidation after CMS page mutations. */
  async invalidatePublicCmsPagesCache(): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.cmsPagesPattern(),
        CacheKeys.homepage.footerNavPattern(),
      ],
    });
    this.invalidateFooterNavLocalCache();
  }

  /**
   * Lightweight footer chrome for every page — categories, brands, policy links.
   * No images / signed URLs / CMS HTML bodies.
   */
  async getFooterNav(): Promise<IPublicFooterNav> {
    const startedAt = Date.now();
    if (this.footerNavL1 && this.footerNavL1.expiresAt > Date.now()) {
      this.logger.debug(`footer_nav L1 hit ${Date.now() - startedAt}ms`);
      return this.footerNavL1.value;
    }

    const value = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.footerNav(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadFooterNavUncached(),
    });
    this.footerNavL1 = { expiresAt: Date.now() + CHROME_L1_TTL_MS, value };
    this.logger.debug(`footer_nav redis ${Date.now() - startedAt}ms`);
    return value;
  }

  async loadFooterNavUncached(): Promise<IPublicFooterNav> {
    const [shopByTiles, brands, policies] = await Promise.all([
      this.loadShopByCategoryTreeUncached(),
      this.brandsRepository.findHomePageBrands(FOOTER_BRAND_LIMIT),
      this.cmsPagesService.findActivePolicyLinks(),
    ]);

    return {
      categories: shopByTiles.slice(0, FOOTER_CATEGORY_LIMIT).map((tile) => ({
        refId: tile.refId,
        name: tile.name,
        slug: tile.slug,
        permalink: tile.permalink,
      })),
      brands: brands.map((brand) => ({
        refId: brand.refId,
        name: brand.name,
        slug: brand.slug,
      })),
      policies,
    };
  }

  invalidateFooterNavLocalCache(): void {
    this.footerNavL1 = null;
  }

  /** Cached banner bundle (unsigned refs) — fetch once per `/sections` build. */
  loadHomepageBannerReferences(): Promise<IHomepageBannersBundle> {
    return this.bannersService.getHomepageBannerReferences();
  }

  /**
   * Hero Banner section — HERO_PRIMARY + HERO_SECONDARY banners.
   * Returns storage references; signed URLs are added after the sections cache read.
   */
  async getHeroBannerSection(): Promise<IPublicHeroBannerSection> {
    const { hero } = await this.bannersService.getHomepageBannerReferences();
    return { primary: hero.primary, secondary: hero.secondary };
  }

  /** Festival Banners section — MAIN_PROMO placement. */
  async getFestivalBanners(): Promise<IStorefrontBannerItem[]> {
    const { mainPromo } = await this.bannersService.getHomepageBannerReferences();
    return mainPromo;
  }

  /** Brand Banners section — BRAND_WISE placement, split into left/right slots. */
  async getBrandBanners(): Promise<IPublicBrandBannersSection> {
    const { brandWise } = await this.bannersService.getHomepageBannerReferences();
    return { left: brandWise.left, right: brandWise.right };
  }

  async getHeaderCategoryTree(): Promise<IPublicHeaderCategory[]> {
    const startedAt = Date.now();
    // Nav tree has no storage refs — skip enrichDeep (was signing unused image/banner URLs).
    if (this.headerTreeL1 && this.headerTreeL1.expiresAt > Date.now()) {
      this.logger.debug(
        `header_category_tree L1 hit ${Date.now() - startedAt}ms`,
      );
      return this.headerTreeL1.value;
    }

    const value = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.categoryHeader(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHeaderCategoryTreeUncached(),
    });
    this.headerTreeL1 = { expiresAt: Date.now() + CHROME_L1_TTL_MS, value };
    this.logger.debug(`header_category_tree redis ${Date.now() - startedAt}ms`);
    return value;
  }

  /** Drop process-local header tree cache (call with Redis header invalidation). */
  invalidateHeaderTreeLocalCache(): void {
    this.headerTreeL1 = null;
  }

  /** Used by cache refresh after category mutations. */
  async loadHeaderCategoryTreeUncached(): Promise<IPublicHeaderCategory[]> {
    const categories = await this.categoriesRepository.findActiveHeaderCategories();
    return this.buildHeaderCategoryTree(categories);
  }

  async getShopByCategoryTree(): Promise<IPublicShopByCategoryTile[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.shopByCategory(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadShopByCategoryTreeUncached(),
    });
  }

  /** Used by cache refresh after category mutations. */
  async loadShopByCategoryTreeUncached(): Promise<IPublicShopByCategoryTile[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    return this.buildShopByCategoryTree(categories);
  }

  async getBestSellers(): Promise<IPublicBestSellersSection> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.bestSellers(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadBestSellersUncached(),
    });
  }

  /** Used by cache refresh after product/category mutations. */
  async loadBestSellersUncached(): Promise<IPublicBestSellersSection> {
    const categories = await this.productsRepository.findRootCategoriesWithTag(
      BEST_SELLERS_TAG_SLUG,
      { limit: BEST_SELLERS_MAX_CATEGORIES, publishedOnly: true },
    );

    if (!categories.length) {
      return { categories: [] };
    }

    const productsByCategoryId =
      await this.productsRepository.findPublishedByCategoryIdsAndTag(
        categories.map((category) => category.id),
        BEST_SELLERS_TAG_SLUG,
        BEST_SELLERS_PRODUCTS_PER_CATEGORY,
      );

    const tabs = categories
      .map((category, position) => {
        const products = productsByCategoryId.get(category.id) ?? [];
        if (!products.length) {
          return null;
        }

        return {
          index: position + 1,
          refId: category.refId,
          name: category.name,
          slug: category.slug,
          products: mapProductEntitiesToPublicStorefrontCards(products),
        };
      })
      .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));

    return { categories: tabs };
  }

  async getWatchAndShop(): Promise<IPublicWatchAndShopSection> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.watchAndShop(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadWatchAndShopUncached(),
    });
  }

  /** Used by cache refresh after Watch & Shop item mutations. */
  async loadWatchAndShopUncached(): Promise<IPublicWatchAndShopSection> {
    const storefrontItems = await this.watchAndShopService.loadWatchAndShopUncached(
      HOMEPAGE_WATCH_AND_SHOP_PREVIEW_LIMIT,
    );
    if (!storefrontItems.length) {
      return { items: [] };
    }

    const productRefIds = [...new Set(storefrontItems.map((item) => item.productRefId))];
    const products = await this.productsRepository.findPublishedByRefIds(productRefIds);
    const productByRefId = new Map(products.map((product) => [product.refId, product]));

    const items = storefrontItems
      .map((item) => {
        const product = productByRefId.get(item.productRefId);
        if (!product) return null;

        return {
          refId: item.refId,
          title: item.title,
          videoUrl: item.videoUrl,
          mediaUrl: item.mediaUrl as IPublicWatchAndShopItem['mediaUrl'],
          sortOrder: item.sortOrder,
          product: mapProductEntitiesToPublicStorefrontCards([product])[0]!,
        };
      })
      .filter((item): item is IPublicWatchAndShopItem => item !== null);

    return { items };
  }

  async getHealthReads(): Promise<IPublicHealthReadsSection> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.healthReads(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.blogPostsService.loadHealthReadsUncached(),
    });
  }

  async getCuratedWellnessEssentials(): Promise<IPublicCuratedWellnessEssentialsSection> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.curatedWellnessEssentials(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadCuratedWellnessEssentialsUncached(),
    });
  }

  /** Used by cache refresh after Expert Talk / Testimonial mutations. */
  async loadCuratedWellnessEssentialsUncached(): Promise<IPublicCuratedWellnessEssentialsSection> {
    const [talks, testimonials] = await Promise.all([
      this.expertTalkService.loadExpertTalksUncached(HOMEPAGE_SECTION_PREVIEW_LIMIT),
      this.testimonialService.loadTestimonialsUncached(HOMEPAGE_TESTIMONIALS_PREVIEW_LIMIT),
    ]);

    return {
      expertTalks: talks.map((item) => ({
        refId: item.refId,
        title: item.title,
        description: item.description,
        videoUrl: item.videoUrl,
        thumbnail: item.thumbnail,
        contentType: item.contentType,
        sortOrder: item.sortOrder,
      })),
      testimonials: testimonials.map((item) => ({
        refId: item.refId,
        name: item.name,
        city: item.city,
        rating: item.rating,
        description: item.description,
        image: item.image,
        sortOrder: item.sortOrder,
      })),
    };
  }

  async getShopByWellnessGoals(): Promise<IPublicWellnessGoalCard[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.shopByWellnessGoals(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadShopByWellnessGoalsUncached(),
    });
  }

  /** Used by cache refresh after wellness goal mutations. */
  async loadShopByWellnessGoalsUncached(): Promise<IPublicWellnessGoalCard[]> {
    const goals = await this.wellnessGoalsRepository.findHomePageGoals(
      SHOP_BY_WELLNESS_GOALS_LIMIT,
    );

    return goals.map((goal) => ({
      refId: goal.refId,
      name: goal.name,
      image: this.storageUrlEnricher.persist(goal.image),
    }));
  }

  async getExpertCuratedBundles(): Promise<IPublicHealthConcernCard[]> {
    const raw = await this.getExpertCuratedBundlesCached();
    return this.storageUrlEnricher.enrichDeep(raw);
  }

  /** Unsigned refs for `/sections` cache. Dedicated GET signs after this. */
  getExpertCuratedBundlesCached(): Promise<IPublicHealthConcernCard[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.expertCuratedBundles(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadExpertCuratedBundlesUncached(),
    });
  }

  /** Used by cache refresh after health concern mutations. Banner is intentionally omitted. */
  async loadExpertCuratedBundlesUncached(): Promise<IPublicHealthConcernCard[]> {
    const concerns = await this.healthConcernsRepository.findHomePageConcerns(
      EXPERT_CURATED_BUNDLES_LIMIT,
    );

    return concerns.map((concern) => ({
      refId: concern.refId,
      name: concern.name,
      slug: concern.slug,
      description: concern.description,
      icon: this.storageUrlEnricher.persist(concern.icon),
    }));
  }

  /**
   * Active health concerns flagged for the homepage (`inHomePage`), ordered by sortIndex.
   * Used by the mobile/web homepage strip — includes icon + banner for card display.
   */
  async getHomePageHealthConcerns(): Promise<IPublicHomePageHealthConcern[]> {
    const raw = await this.getHomePageHealthConcernsCached();
    return this.storageUrlEnricher.enrichDeep(raw);
  }

  /** Unsigned refs for `/sections` cache. Dedicated GET signs after this. */
  getHomePageHealthConcernsCached(): Promise<IPublicHomePageHealthConcern[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.healthConcerns(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHomePageHealthConcernsUncached(),
    });
  }

  /** Used by cache refresh after health concern mutations. */
  async loadHomePageHealthConcernsUncached(): Promise<IPublicHomePageHealthConcern[]> {
    const concerns = await this.healthConcernsRepository.findActiveHomePageConcerns();

    return concerns.map((concern) => ({
      refId: concern.refId,
      name: concern.name,
      slug: concern.slug,
      description: concern.description,
      icon: this.storageUrlEnricher.persist(concern.icon),
      banner: this.storageUrlEnricher.persist(concern.banner),
      sortIndex: concern.sortIndex,
      metaTitle: concern.metaTitle,
      metaDescription: concern.metaDescription,
      medicalConditionName: concern.medicalConditionName,
      patientAudience: concern.patientAudience,
    }));
  }

  async getBrandsWeTrust(): Promise<IPublicBrandCard[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.brandsWeTrust(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadBrandsWeTrustUncached(),
    });
  }

  /** Used by cache refresh after brand mutations. */
  async loadBrandsWeTrustUncached(): Promise<IPublicBrandCard[]> {
    const brands = await this.brandsRepository.findHomePageBrands(BRANDS_WE_TRUST_LIMIT);

    return brands.map((brand) => ({
      refId: brand.refId,
      name: brand.name,
      slug: brand.slug,
      logo: this.storageUrlEnricher.persist(brand.logo),
    }));
  }

  /**
   * Homepage "View all" — every active brand (paginated).
   * Distinct from the limited Brands We Trust homepage strip.
   */
  async findAllBrandsPaginated(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedResult<IPublicBrandCard>> {
    const options = this.buildViewAllPaginationOptions(query, 'name', 'ASC');
    const { data, total } = await this.brandsRepository.findPublicPaginated(options);
    const cards: IPublicBrandCard[] = data.map((brand) => ({
      refId: brand.refId,
      name: brand.name,
      slug: brand.slug,
      logo: this.storageUrlEnricher.persist(brand.logo),
    }));
    const enriched = await this.storageUrlEnricher.enrichDeep(cards);
    return buildPaginatedResult(enriched, total, options);
  }

  /**
   * Homepage "View all" — every active health concern (paginated).
   * Distinct from `getHomePageHealthConcerns` (inHomePage strip with sortIndex).
   */
  async findAllHealthConcernsPaginated(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedResult<IPublicHomePageHealthConcern>> {
    const options = this.buildViewAllPaginationOptions(query, 'name', 'ASC');
    const { data, total } = await this.healthConcernsRepository.findPublicPaginated(options);
    const cards: IPublicHomePageHealthConcern[] = data.map((concern) => ({
      refId: concern.refId,
      name: concern.name,
      slug: concern.slug,
      description: concern.description,
      icon: this.storageUrlEnricher.persist(concern.icon),
      banner: this.storageUrlEnricher.persist(concern.banner),
      sortIndex: concern.sortIndex,
      metaTitle: concern.metaTitle,
      metaDescription: concern.metaDescription,
      medicalConditionName: concern.medicalConditionName,
      patientAudience: concern.patientAudience,
    }));
    const enriched = await this.storageUrlEnricher.enrichDeep(cards);
    return buildPaginatedResult(enriched, total, options);
  }

  /**
   * Homepage "View all" — every active wellness goal (paginated).
   * Distinct from the limited Shop by Wellness Goals homepage strip.
   */
  async findAllWellnessGoalsPaginated(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    },
  ): Promise<PaginatedResult<IPublicWellnessGoalCard>> {
    const options = this.buildViewAllPaginationOptions(query, 'name', 'ASC');
    const { data, total } = await this.wellnessGoalsRepository.findPublicPaginated(options);
    const cards: IPublicWellnessGoalCard[] = data.map((goal) => ({
      refId: goal.refId,
      name: goal.name,
      description: goal.description,
      image: this.storageUrlEnricher.persist(goal.image),
    }));
    const enriched = await this.storageUrlEnricher.enrichDeep(cards);
    return buildPaginatedResult(enriched, total, options);
  }

  private buildViewAllPaginationOptions(
    query: {
      page?: number;
      limit?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    },
    defaultSortBy: string,
    defaultSortOrder: 'ASC' | 'DESC',
  ): PaginationOptions {
    const options = buildPaginationOptions({
      ...query,
      sortBy: query.sortBy ?? defaultSortBy,
      sortOrder: query.sortOrder ?? defaultSortOrder,
    });
    return options;
  }

  private buildHeaderCategoryTree(categories: CategoryEntity[]): IPublicHeaderCategory[] {
    const childrenByParentId = new Map<string, CategoryEntity[]>();

    for (const category of categories) {
      if (!category.parentCategoryId) continue;
      const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
      siblings.push(category);
      childrenByParentId.set(category.parentCategoryId, siblings);
    }

    const sortCategories = (items: CategoryEntity[]): CategoryEntity[] =>
      [...items].sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);

    const buildNode = (entity: CategoryEntity, parentSlugPath: string[] = []): IPublicHeaderCategory => {
      const children = sortCategories(childrenByParentId.get(entity.id) ?? []).map((child) =>
        buildNode(child, [...parentSlugPath, entity.slug]),
      );
      return mapHeaderCategoryEntity(entity, children, parentSlugPath);
    };

    return sortCategories(
      categories.filter(
        (category) =>
          category.isInHeader && category.hierarchyLevel === CategoryHierarchyLevel.ROOT,
      ),
    ).map((entity) => buildNode(entity));
  }

  private buildShopByCategoryTree(categories: CategoryEntity[]): IPublicShopByCategoryTile[] {
    const byId = new Map(categories.map((category) => [category.id, category]));

    const sortCategories = (items: CategoryEntity[]): CategoryEntity[] =>
      [...items].sort((a, b) => a.position - b.position || a.hierarchyId - b.hierarchyId);

    const buildAncestorSlugPath = (entity: CategoryEntity): string[] => {
      const slugs: string[] = [];
      let parentId = entity.parentCategoryId;
      while (parentId) {
        const parent = byId.get(parentId);
        if (!parent) break;
        slugs.unshift(parent.slug);
        parentId = parent.parentCategoryId;
      }
      return slugs;
    };

    return sortCategories(
      categories.filter(
        (category) =>
          category.isInShopBy && isHomepageShopByHierarchyLevel(category.hierarchyLevel),
      ),
    ).map((entity) => mapCategoryEntityToShopByTile(entity, buildAncestorSlugPath(entity)));
  }
}
