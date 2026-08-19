import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
  PaginationOptions,
} from '@packages/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
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
import {
  IPublicBrandBannersSection,
  IPublicHeroBannerSection,
} from '../interfaces/public-banner-section.interface';
import { IPublicBrandCard } from '../interfaces/public-brand.interface';
import { IPublicHealthConcernCard, IPublicHomePageHealthConcern } from '../interfaces/public-health-concern.interface';
import { IPublicCategoryTree, IPublicHeaderCategory } from '../interfaces/public-category.interface';
import { IPublicWellnessGoalCard } from '../interfaces/public-wellness-goal.interface';
import { mapCategoryEntityToPublicTree, mapHeaderCategoryEntity } from '../mappers/public-category.mapper';
import { mapProductEntitiesToPublicCards } from '../mappers/public-product.mapper';
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

@Injectable()
export class HomepageService {
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
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}
  getHomepageBanners(): Promise<IHomepageBannersBundle> {
    return this.bannersService.getHomepageBanners();
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
    const cached = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.categoryHeader(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHeaderCategoryTreeUncached(),
    });

    // Sign storage references after cache read so signed URLs stay fresh.
    return this.storageUrlEnricher.enrichDeep(cached);
  }

  /** Used by cache refresh after category mutations. */
  async loadHeaderCategoryTreeUncached(): Promise<IPublicHeaderCategory[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    return this.buildHeaderCategoryTree(categories);
  }

  async getShopByCategoryTree(): Promise<IPublicCategoryTree[]> {
    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.shopByCategory(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadShopByCategoryTreeUncached(),
    });
  }

  /** Used by cache refresh after category mutations. */
  async loadShopByCategoryTreeUncached(): Promise<IPublicCategoryTree[]> {
    const categories = await this.categoriesRepository.findActiveCategories();
    return this.buildShopByCategoryTree(categories);
  }

  async getBestSellers(): Promise<IPublicBestSellersSection> {
    const raw = await this.cacheStrategy.cacheAside({
      // v2: load products via findPublishedPaginated (same path as list API).
      key: `${CacheKeys.homepage.bestSellers()}:v2`,
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadBestSellersUncached(),
    });
    // Sign storage references AFTER cache read so signed URLs are never persisted.
    return this.storageUrlEnricher.enrichDeep(raw);
  }

  /** Used by cache refresh after product/category mutations. */
  async loadBestSellersUncached(): Promise<IPublicBestSellersSection> {
    const categories = await this.productsRepository.findRootCategoriesWithTag(
      BEST_SELLERS_TAG_SLUG,
      { limit: BEST_SELLERS_MAX_CATEGORIES, publishedOnly: true },
    );

    const tabs = await Promise.all(
      categories.map(async (category, position) => {
        const products = await this.productsRepository.findPublishedByCategoryAndTag(
          category.id,
          BEST_SELLERS_TAG_SLUG,
          BEST_SELLERS_PRODUCTS_PER_CATEGORY,
        );

        return {
          index: position + 1,
          refId: category.refId,
          name: category.name,
          slug: category.slug,
          products: mapProductEntitiesToPublicCards(products),
        };
      }),
    );

    return { categories: tabs.filter((tab) => tab.products.length > 0) };
  }

  async getWatchAndShop(): Promise<IPublicWatchAndShopSection> {
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.watchAndShop(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadWatchAndShopUncached(),
    });
    // Sign storage references AFTER cache read so signed URLs are never persisted.
    return this.storageUrlEnricher.enrichDeep(raw);
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

    const items = (
      await Promise.all(
        storefrontItems.map(async (item) => {
          const product = productByRefId.get(item.productRefId);
          if (!product) return null;

          return {
            refId: item.refId,
            title: item.title,
            videoUrl: item.videoUrl,
            mediaUrl: item.mediaUrl as IPublicWatchAndShopItem['mediaUrl'],
            sortOrder: item.sortOrder,
            product: mapProductEntitiesToPublicCards([product])[0]!,
          };
        }),
      )
    ).filter((item): item is IPublicWatchAndShopItem => item !== null);

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
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.shopByWellnessGoals(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadShopByWellnessGoalsUncached(),
    });
    return this.storageUrlEnricher.enrichDeep(raw);
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
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.expertCuratedBundles(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadExpertCuratedBundlesUncached(),
    });
    return this.storageUrlEnricher.enrichDeep(raw);
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
   * All active health concerns flagged for the homepage, ordered by sortIndex.
   * Includes sortIndex so the storefront can control display order.
   */
  async getHomePageHealthConcerns(): Promise<IPublicHomePageHealthConcern[]> {
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.healthConcerns(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHomePageHealthConcernsUncached(),
    });
    return this.storageUrlEnricher.enrichDeep(raw);
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
    }));
  }

  async getBrandsWeTrust(): Promise<IPublicBrandCard[]> {
    const raw = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.brandsWeTrust(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadBrandsWeTrustUncached(),
    });
    return this.storageUrlEnricher.enrichDeep(raw);
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

  private buildShopByCategoryTree(categories: CategoryEntity[]): IPublicCategoryTree[] {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const childrenByParentId = new Map<string, CategoryEntity[]>();

    for (const category of categories) {
      if (!category.parentCategoryId) continue;
      const siblings = childrenByParentId.get(category.parentCategoryId) ?? [];
      siblings.push(category);
      childrenByParentId.set(category.parentCategoryId, siblings);
    }

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

    const buildNode = (entity: CategoryEntity, parentSlugPath: string[] = []): IPublicCategoryTree => {
      const children = sortCategories(childrenByParentId.get(entity.id) ?? []).map((child) =>
        buildNode(child, [...parentSlugPath, entity.slug]),
      );
      return mapCategoryEntityToPublicTree(entity, children, parentSlugPath);
    };

    return sortCategories(
      categories.filter(
        (category) =>
          category.isInShopBy && isHomepageShopByHierarchyLevel(category.hierarchyLevel),
      ),
    ).map((entity) => buildNode(entity, buildAncestorSlugPath(entity)));
  }
}
