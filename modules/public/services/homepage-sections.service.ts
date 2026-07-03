import { Injectable } from '@nestjs/common';
import {
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import {
  HomepageSectionData,
  IHomepageSection,
  IHomepageSectionsResponse,
} from '../interfaces/homepage-section.interface';
import { HomepageService } from './homepage.service';

/** Full homepage sections response is cached for 60 minutes. */
const HOMEPAGE_SECTIONS_TTL_SECONDS = 60 * 60;

@Injectable()
export class HomepageSectionsService {
  /** Data loaders keyed by section type. Types without a loader return null data. */
  private readonly loaders: Partial<
    Record<HomeSectionType, () => Promise<HomepageSectionData>>
  > = {
    [HomeSectionType.HERO_BANNER]: () => this.homepageService.getHeroBannerSection(),
    [HomeSectionType.SHOP_BY_CATEGORY]: () => this.homepageService.getShopByCategoryTree(),
    [HomeSectionType.SHOP_BY_WELLNESS_GOALS]: () => this.homepageService.getShopByWellnessGoals(),
    [HomeSectionType.BRANDS_WE_TRUST]: () => this.homepageService.getBrandsWeTrust(),
    [HomeSectionType.FESTIVAL_BANNERS]: () => this.homepageService.getFestivalBanners(),
    [HomeSectionType.BRAND_BANNERS]: () => this.homepageService.getBrandBanners(),
    [HomeSectionType.BEST_SELLERS]: () => this.homepageService.getBestSellers(),
  };

  constructor(
    private readonly homepageService: HomepageService,
    private readonly homeSectionsService: HomeSectionsService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
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
      key: CacheKeys.homepage.sections(this.buildVariantKey(requested)),
      module: CacheModuleName.HOMEPAGE,
      ttlSeconds: HOMEPAGE_SECTIONS_TTL_SECONDS,
      loader: () => this.buildSections(requested),
    });

    // Sign storage references AFTER the cache read so signed URLs (short-lived)
    // are never persisted in the long-lived sections cache.
    return this.storageUrlEnricher.enrichDeep(cached);
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

    const requestedTypes = requested?.length
      ? new Set<string>(requested as unknown as string[])
      : null;

    const visibleSections = requestedTypes
      ? sections.filter((section) => requestedTypes.has(section.type))
      : sections;

    const built = await Promise.all(
      visibleSections.map(async (section): Promise<IHomepageSection> => {
        const loader = this.loaders[section.type];
        return {
          index: section.index,
          type: section.type,
          title: section.title,
          slug: section.slug,
          data: loader ? await loader() : null,
        };
      }),
    );

    return { sections: built };
  }
}
