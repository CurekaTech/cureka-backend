import { Injectable } from '@nestjs/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { HomeSectionType } from '@modules/master/enums/home-section-type.enum';
import { IStorefrontBannerItem } from '@modules/master/interfaces/banner.interface';
import { HomeSectionsService } from '@modules/master/services/home-sections.service';
import { BannersService } from '@modules/master/services/banners.service';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { HomepageSectionKey } from '../enums/homepage-section.enum';
import {
  HomepageActiveSectionData,
  HomepageSectionsResponse,
  IHomepageActiveSection,
  IHomepageActiveSectionsResponse,
  IHomepageBestSellersCategory,
  IHomepageBestSellersSectionData,
  IHomepageBrandBannersSectionData,
  IHomepageExpertCuratedBundle,
  IHomepageHeroBannerSectionData,
} from '../interfaces/homepage-section.interface';
import { IPublicCategoryTree } from '../interfaces/public-category.interface';
import { IPublicProductCard } from '../interfaces/public-product.interface';
import { HomepageService } from './homepage.service';
import { PublicProductsService } from './public-products.service';

@Injectable()
export class HomepageSectionsService {
  private readonly loaders: Partial<
    Record<HomepageSectionKey, () => Promise<HomepageSectionsResponse[HomepageSectionKey]>>
  > = {
    [HomepageSectionKey.SHOP_BY_CATEGORY]: () => this.homepageService.getShopByCategoryTree(),
  };

  constructor(
    private readonly homepageService: HomepageService,
    private readonly homeSectionsService: HomeSectionsService,
    private readonly bannersService: BannersService,
    private readonly publicProductsService: PublicProductsService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async getFlaggedSections(
    requested: HomepageSectionKey[],
  ): Promise<HomepageSectionsResponse> {
    const entries = await Promise.all(
      requested.map(async (key) => {
        const loader = this.loaders[key];
        if (!loader) {
          return [key, undefined] as const;
        }
        return [key, await loader()] as const;
      }),
    );

    return Object.fromEntries(
      entries.filter(([, value]) => value !== undefined),
    ) as HomepageSectionsResponse;
  }

  async getSections(requested?: HomepageSectionKey[]): Promise<HomepageSectionsResponse> {
    const availableKeys = Object.keys(this.loaders) as HomepageSectionKey[];
    const sectionKeys = requested?.length
      ? requested.filter((key) => key in this.loaders)
      : availableKeys;

    return this.getFlaggedSections(sectionKeys);
  }

  async getActiveSectionsWithData(): Promise<IHomepageActiveSectionsResponse> {
    const cached = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.sections(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadActiveSectionsWithDataUncached(),
    });

    // Signed GCS URLs expire (~1h) but homepage section payloads are cached longer.
    // Re-sign media on every response so product/banner images stay loadable.
    return this.refreshHomepageMediaUrls(cached);
  }

  private async refreshHomepageMediaUrls(
    response: IHomepageActiveSectionsResponse,
  ): Promise<IHomepageActiveSectionsResponse> {
    const sections = await Promise.all(
      response.sections.map(async (section) => ({
        ...section,
        data: await this.refreshSectionMediaUrls(section.type, section.data),
      })),
    );

    return { sections };
  }

  private async refreshSectionMediaUrls(
    type: HomeSectionType,
    data: HomepageActiveSectionData,
  ): Promise<HomepageActiveSectionData> {
    if (!data) return data;

    switch (type) {
      case HomeSectionType.SHOP_BY_CATEGORY:
        return this.refreshCategoryTreeMediaUrls(data as IPublicCategoryTree[]);
      case HomeSectionType.BEST_SELLERS:
        return this.refreshBestSellersMediaUrls(data as IHomepageBestSellersSectionData);
      case HomeSectionType.FESTIVAL_BANNERS:
        return this.refreshBannerListMediaUrls(data as IStorefrontBannerItem[]);
      case HomeSectionType.BRAND_BANNERS:
        return this.refreshBrandBannersMediaUrls(data as IHomepageBrandBannersSectionData);
      case HomeSectionType.HERO_BANNER:
        return this.refreshHeroBannerMediaUrls(data as IHomepageHeroBannerSectionData);
      case HomeSectionType.EXPERT_CURATED_BUNDLES:
        return this.refreshExpertCuratedBundlesMediaUrls(
          data as IHomepageExpertCuratedBundle[],
        );
      default:
        return data;
    }
  }

  private async refreshCategoryTreeMediaUrls(
    categories: IPublicCategoryTree[],
  ): Promise<IPublicCategoryTree[]> {
    return Promise.all(
      categories.map(async (category) => ({
        ...category,
        image: await this.storageUrlEnricher.toReference(category.image),
        banner: await this.storageUrlEnricher.toReference(category.banner),
        children: await this.refreshCategoryTreeMediaUrls(category.children ?? []),
      })),
    );
  }

  private async refreshBestSellersMediaUrls(
    data: IHomepageBestSellersSectionData,
  ): Promise<IHomepageBestSellersSectionData> {
    const categories = await Promise.all(
      (data.categories ?? []).map(async (category) => ({
        ...category,
        products: await this.refreshProductCardMediaUrls(category.products ?? []),
      })),
    );

    return { categories };
  }

  private async refreshProductCardMediaUrls(
    products: IPublicProductCard[],
  ): Promise<IPublicProductCard[]> {
    return Promise.all(
      products.map(async (product) => ({
        ...product,
        primaryImageUrl: await this.storageUrlEnricher.toReference(product.primaryImageUrl),
      })),
    );
  }

  private async refreshBannerListMediaUrls(
    banners: IStorefrontBannerItem[],
  ): Promise<IStorefrontBannerItem[]> {
    return Promise.all(
      banners.map(async (banner) => ({
        ...banner,
        imageUrl: (await this.storageUrlEnricher.toReference(banner.imageUrl)) ?? banner.imageUrl,
      })),
    );
  }

  private async refreshBrandBannersMediaUrls(
    data: IHomepageBrandBannersSectionData,
  ): Promise<IHomepageBrandBannersSectionData> {
    const [left, right] = await Promise.all([
      this.refreshBannerListMediaUrls(data.left ?? []),
      this.refreshBannerListMediaUrls(data.right ?? []),
    ]);

    return { left, right };
  }

  private async refreshHeroBannerMediaUrls(
    data: IHomepageHeroBannerSectionData,
  ): Promise<IHomepageHeroBannerSectionData> {
    const [primary, secondary] = await Promise.all([
      this.refreshBannerListMediaUrls(data.primary ?? []),
      this.refreshBannerListMediaUrls(data.secondary ?? []),
    ]);

    return { primary, secondary };
  }

  private async refreshExpertCuratedBundlesMediaUrls(
    bundles: IHomepageExpertCuratedBundle[],
  ): Promise<IHomepageExpertCuratedBundle[]> {
    return Promise.all(
      bundles.map(async (bundle) => ({
        ...bundle,
        icon: await this.storageUrlEnricher.toReference(bundle.icon),
      })),
    );
  }

  private async loadActiveSectionsWithDataUncached(): Promise<IHomepageActiveSectionsResponse> {
    const { sections } = await this.homeSectionsService.findActive();
    const activeSections = await Promise.all(
      [...sections]
        .sort((left, right) => left.index - right.index || left.slug.localeCompare(right.slug))
        .map(async (section): Promise<IHomepageActiveSection> => ({
          index: section.index,
          type: section.type,
          title: section.title,
          slug: section.slug,
          data: await this.loadActiveSectionData(section.type),
        })),
    );

    return { sections: activeSections };
  }

  private async loadActiveSectionData(
    type: HomeSectionType,
  ): Promise<HomepageActiveSectionData> {
    switch (type) {
      case HomeSectionType.SHOP_BY_CATEGORY:
        return this.homepageService.getShopByCategoryTree();
      case HomeSectionType.BEST_SELLERS:
        return this.loadBestSellersSectionData();
      case HomeSectionType.FESTIVAL_BANNERS:
        return (await this.bannersService.getHomepageBanners()).mainPromo;
      case HomeSectionType.BRAND_BANNERS: {
        const brandWise = (await this.bannersService.getHomepageBanners()).brandWise;
        return {
          left: brandWise.left,
          right: brandWise.right,
        };
      }
      case HomeSectionType.HERO_BANNER: {
        const hero = (await this.bannersService.getHomepageBanners()).hero;
        return {
          primary: hero.primary,
          secondary: hero.secondary,
        };
      }
      case HomeSectionType.EXPERT_CURATED_BUNDLES:
        return this.homepageService.getExpertCuratedBundles();
      default:
        return null;
    }
  }

  private async loadBestSellersSectionData(): Promise<{
    categories: IHomepageBestSellersCategory[];
  }> {
    const categories = await this.homepageService.getShopByCategoryTree();

    const rows = await Promise.all(
      categories.map(async (category, index) => ({
        index: index + 1,
        refId: category.refId,
        name: category.name,
        slug: category.slug,
        products: await this.loadBestSellerProducts(category.refId),
      })),
    );

    return { categories: rows };
  }

  private async loadBestSellerProducts(categoryRefId: string) {
    const result = await this.publicProductsService.findAll({
      categoryRefId,
      page: 1,
      limit: 12,
      sortBy: 'publishedAt',
      sortOrder: 'DESC',
    });

    return result.data;
  }
}
