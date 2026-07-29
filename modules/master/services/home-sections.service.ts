import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { generateUniqueRefId } from '@packages/common';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
import {
  CreateHomeSectionDto,
  ReorderHomeSectionsDto,
  UpdateHomeSectionDto,
  UpdateHomeSectionStatusDto,
} from '../dto/home-section.dto';
import {
  HomeSectionBannerItem,
  HomeSectionEntity,
} from '../entities/home-section.entity';
import {
  CUSTOM_HOME_SECTION_TYPES,
  HomeSectionType,
  isCustomHomeSectionType,
} from '../enums/home-section-type.enum';
import { MasterStatus } from '../enums/master-status.enum';
import {
  IHomeSection,
  IHomeSectionListResponse,
} from '../interfaces/home-section.interface';
import {
  mapHomeSectionEntitiesToResponse,
  mapHomeSectionEntityToResponse,
} from '../mappers/home-section.mapper';
import { HomeSectionsRepository } from '../repositories/home-sections.repository';

/** Indexed / reorderable system sections only (footer-static blocks are not seeded). */
const DEFAULT_HOME_SECTIONS: Array<{
  title: string;
  slug: string;
  type: HomeSectionType;
  sectionIndex: number;
}> = [
  {
    title: 'Shop by Wellness Goals',
    slug: 'shop-by-wellness-goals',
    type: HomeSectionType.SHOP_BY_WELLNESS_GOALS,
    sectionIndex: 0,
  },
  {
    title: 'Brands We Trust',
    slug: 'brands-we-trust',
    type: HomeSectionType.BRANDS_WE_TRUST,
    sectionIndex: 1,
  },
];

/**
 * Retired from homepage indexing — soft-deleted on cleanup.
 * Fixed storefront sections still render outside indexing; CMS modules remain.
 * Festival/Brand system rows replaced by custom `banner` sections (festive/brand).
 * Podcasts + Customer Reviews, Health Reads, Watch & Shop stay on the storefront
 * via FIXED_HOMEPAGE_SECTIONS (footer-static), not indexing.
 */
const RETIRED_HOME_SECTION_TYPES: HomeSectionType[] = [
  HomeSectionType.HERO_BANNER,
  HomeSectionType.BUILT_BY_DOCTORS_BANNER,
  HomeSectionType.SHOP_BY_CATEGORY,
  HomeSectionType.BEST_SELLERS,
  HomeSectionType.EXPERT_CURATED_BUNDLES,
  HomeSectionType.CURATED_WELLNESS_ESSENTIALS,
  HomeSectionType.HEALTH_READS,
  HomeSectionType.WATCH_AND_SHOP,
  HomeSectionType.CONSULT_DOCTORS,
  HomeSectionType.FESTIVAL_BANNERS,
  HomeSectionType.BRAND_BANNERS,
];

const HOME_SECTION_UPLOAD_FIELDS = {
  banner_image: UploadFolder.BANNERS,
  banner_image_2: UploadFolder.BANNERS,
  mobileImageUrl: UploadFolder.BANNERS,
} as const;

@Injectable()
export class HomeSectionsService implements OnModuleInit {
  private readonly logger = new Logger(HomeSectionsService.name);

  constructor(
    private readonly homeSectionsRepository: HomeSectionsRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly productsRepository: ProductsRepository,
    private readonly categoriesRepository: CategoriesRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const cleaned = await this.cleanupSections();
      const seeded = await this.seedMissingDefaults();
      if (cleaned || seeded) {
        await this.invalidateHomeSectionsCache();
      }
    } catch (error) {
      this.logger.warn(
        `Skipping default seed — run database migrations first. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(): Promise<IHomeSectionListResponse> {
    const cleaned = await this.cleanupSections();
    const seeded = await this.seedMissingDefaults();
    if (cleaned || seeded) {
      await this.invalidateHomeSectionsCache();
    }

    const sections = await this.homeSectionsRepository.findAllSorted();
    return {
      sections: await this.enrichSections(mapHomeSectionEntitiesToResponse(sections)),
    };
  }

  async findActive(): Promise<IHomeSectionListResponse> {
    const cleaned = await this.cleanupSections();
    const seeded = await this.seedMissingDefaults();
    if (cleaned || seeded) {
      await this.invalidateHomeSectionsCache();
    }

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.homeSections(),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const sections = await this.homeSectionsRepository.findActiveSorted();
        // Persist storage refs without signed URLs in cache.
        return { sections: mapHomeSectionEntitiesToResponse(sections) };
      },
    });
  }

  async findOne(refId: string): Promise<IHomeSection> {
    const existing = await this.homeSectionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Home section with refId ${refId} not found`);
    }
    const [enriched] = await this.enrichSections([mapHomeSectionEntityToResponse(existing)]);
    return enriched!;
  }

  async findActiveCustomBySlug(slug: string): Promise<IHomeSection> {
    const existing = await this.homeSectionsRepository.findActiveBySlug(slug);
    if (!existing || !isCustomHomeSectionType(existing.type)) {
      throw new NotFoundException(`Home section with slug ${slug} not found`);
    }
    const [enriched] = await this.enrichSections([mapHomeSectionEntityToResponse(existing)]);
    return enriched!;
  }

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IHomeSection> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateHomeSectionDto,
      HOME_SECTION_UPLOAD_FIELDS,
    );

    return this.createCustom(dto, uploadedUrls, createdBy);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IHomeSection> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateHomeSectionDto,
      HOME_SECTION_UPLOAD_FIELDS,
    );

    return this.updateCustom(refId, dto, uploadedUrls, updatedBy);
  }

  async createCustom(
    dto: CreateHomeSectionDto,
    uploadedUrls: Record<string, string>,
    createdBy: string,
  ): Promise<IHomeSection> {
    if (!isCustomHomeSectionType(dto.type)) {
      throw new BadRequestException('Only banner, productSlider, or categorySlider can be created');
    }

    const content = await this.buildCustomContent(dto.type, dto, uploadedUrls, true);
    const maxIndex = await this.homeSectionsRepository.getMaxSectionIndex();
    const sectionIndex = Math.max(1, maxIndex + 1);

    const seo = this.resolveSeoFields(dto.type, dto);

    const entity = await this.homeSectionsRepository.createSection({
      title: dto.title.trim(),
      slug: this.generateSlugFromTitle(dto.title),
      type: dto.type,
      sectionIndex,
      status: dto.status ?? MasterStatus.ACTIVE,
      banners: content.banners,
      productRefIds: content.productRefIds,
      categoryRefIds: content.categoryRefIds,
      pageTitle: seo.pageTitle,
      pageDescription: seo.pageDescription,
      pageCanonicalUrl: seo.pageCanonicalUrl,
      refId: await generateUniqueRefId(dto.title, (refId) =>
        this.homeSectionsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.invalidateHomeSectionsCache();
    const [enriched] = await this.enrichSections([mapHomeSectionEntityToResponse(entity)]);
    return enriched!;
  }

  async updateCustom(
    refId: string,
    dto: UpdateHomeSectionDto,
    uploadedUrls: Record<string, string>,
    updatedBy: string,
  ): Promise<IHomeSection> {
    const existing = await this.homeSectionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Home section with refId ${refId} not found`);
    }
    if (!isCustomHomeSectionType(existing.type)) {
      throw new BadRequestException('System home sections cannot be edited via this endpoint');
    }

    const content = await this.buildCustomContent(
      existing.type,
      {
        linkUrl: dto.linkUrl,
        linkUrl2: dto.linkUrl2,
        bannerVariant: dto.bannerVariant,
        productRefIds: dto.productRefIds,
        categoryRefIds: dto.categoryRefIds,
      },
      uploadedUrls,
      false,
      existing,
    );

    const seo = this.resolveSeoFields(existing.type, {
      pageTitle: dto.pageTitle ?? existing.pageTitle ?? undefined,
      pageDescription: dto.pageDescription ?? existing.pageDescription ?? undefined,
      pageCanonicalUrl: dto.pageCanonicalUrl ?? existing.pageCanonicalUrl ?? undefined,
    });

    const updated = await this.homeSectionsRepository.updateByRefId(refId, {
      title: (dto.title ?? existing.title).trim(),
      slug: this.generateSlugFromTitle(dto.title ?? existing.title),
      banners: content.banners,
      productRefIds: content.productRefIds,
      categoryRefIds: content.categoryRefIds,
      pageTitle: seo.pageTitle,
      pageDescription: seo.pageDescription,
      pageCanonicalUrl: seo.pageCanonicalUrl,
      status: dto.status ?? existing.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Home section with refId ${refId} not found after update`);
    }

    await this.invalidateHomeSectionsCache();
    const [enriched] = await this.enrichSections([mapHomeSectionEntityToResponse(updated)]);
    return enriched!;
  }

  async updateStatus(
    refId: string,
    dto: UpdateHomeSectionStatusDto,
    updatedBy: string,
  ): Promise<IHomeSection> {
    const existing = await this.homeSectionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Home section with refId ${refId} not found`);
    }

    const updated = await this.homeSectionsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Home section with refId ${refId} not found after update`);
    }

    await this.invalidateHomeSectionsCache();
    const [enriched] = await this.enrichSections([mapHomeSectionEntityToResponse(updated)]);
    return enriched!;
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.homeSectionsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Home section with refId ${refId} not found`);
    }
    if (!isCustomHomeSectionType(existing.type)) {
      throw new BadRequestException('System home sections cannot be deleted');
    }

    await this.homeSectionsRepository.softDeleteByRefId(refId);
    await this.invalidateHomeSectionsCache();
  }

  async reorder(dto: ReorderHomeSectionsDto, updatedBy: string): Promise<IHomeSectionListResponse> {
    for (const item of dto.sections) {
      const existing = await this.homeSectionsRepository.findByRefId(item.refId);
      if (!existing) {
        throw new NotFoundException(`Home section with refId ${item.refId} not found`);
      }
    }

    const indexes = dto.sections.map((item) => item.newIndex);
    const uniqueIndexes = new Set(indexes);
    if (uniqueIndexes.size !== indexes.length) {
      throw new BadRequestException('Section indexes must be unique');
    }

    await this.homeSectionsRepository.reorderSections(
      dto.sections.map((item) => ({
        refId: item.refId,
        sectionIndex: item.newIndex,
      })),
    );

    for (const item of dto.sections) {
      await this.homeSectionsRepository.updateByRefId(item.refId, { updatedBy });
    }

    await this.invalidateHomeSectionsCache();
    return this.findAll();
  }

  private async buildCustomContent(
    type: HomeSectionType,
    dto: Pick<
      CreateHomeSectionDto,
      'linkUrl' | 'linkUrl2' | 'bannerVariant' | 'productRefIds' | 'categoryRefIds'
    >,
    uploadedUrls: Record<string, string>,
    requireComplete: boolean,
    existing?: HomeSectionEntity,
  ): Promise<{
    banners: HomeSectionBannerItem[] | null;
    productRefIds: string[] | null;
    categoryRefIds: string[] | null;
  }> {
    if (type === HomeSectionType.BANNER) {
      const desktop = uploadedUrls['banner_image'];
      const desktop2 = uploadedUrls['banner_image_2'];
      const existingBanners = existing?.banners ?? [];
      const variant =
        dto.bannerVariant === 'brand' || dto.bannerVariant === 'festive'
          ? dto.bannerVariant
          : existingBanners[0]?.variant === 'brand'
            ? 'brand'
            : 'festive';

      if (requireComplete && !desktop) {
        throw new BadRequestException('banner_image is required for banner sections');
      }

      const hasNewUpload = Boolean(desktop || desktop2);
      if (!hasNewUpload && !existingBanners.length) {
        throw new BadRequestException('banner_image is required for banner sections');
      }

      const firstImage = this.storageUrlEnricher.persist(
        desktop ?? existingBanners[0]?.imageUrl,
      );
      if (!firstImage) {
        throw new BadRequestException('banner_image is required for banner sections');
      }

      const banners: HomeSectionBannerItem[] = [
        {
          imageUrl: firstImage,
          mobileImageUrl: null,
          linkUrl: (dto.linkUrl ?? existingBanners[0]?.linkUrl ?? '#').trim() || '#',
          variant,
        },
      ];

      if (variant === 'brand') {
        const secondImage = this.storageUrlEnricher.persist(
          desktop2 ?? existingBanners[1]?.imageUrl,
        );
        if (secondImage) {
          banners.push({
            imageUrl: secondImage,
            mobileImageUrl: null,
            linkUrl:
              (dto.linkUrl2 ?? existingBanners[1]?.linkUrl ?? dto.linkUrl ?? '#').trim() ||
              '#',
            variant,
          });
        }
      }

      return { banners, productRefIds: null, categoryRefIds: null };
    }

    if (type === HomeSectionType.PRODUCT_SLIDER) {
      const productRefIds = dto.productRefIds ?? existing?.productRefIds ?? [];
      if (!productRefIds.length) {
        throw new BadRequestException('Select at least one product');
      }
      await this.assertProductsExist(productRefIds);
      return { banners: null, productRefIds, categoryRefIds: null };
    }

    if (type === HomeSectionType.CATEGORY_SLIDER) {
      const categoryRefIds = dto.categoryRefIds ?? existing?.categoryRefIds ?? [];
      if (!categoryRefIds.length) {
        throw new BadRequestException('Select at least one category');
      }
      await this.assertCategoriesExist(categoryRefIds);
      return { banners: null, productRefIds: null, categoryRefIds };
    }

    throw new BadRequestException(`Unsupported home section type: ${type}`);
  }

  private async assertProductsExist(refIds: string[]): Promise<void> {
    for (const refId of refIds) {
      const exists = await this.productsRepository.existsByRefId(refId);
      if (!exists) {
        throw new BadRequestException(`Product not found: ${refId}`);
      }
    }
  }

  private async assertCategoriesExist(refIds: string[]): Promise<void> {
    for (const refId of refIds) {
      const exists = await this.categoriesRepository.existsByRefId(refId);
      if (!exists) {
        throw new BadRequestException(`Category not found: ${refId}`);
      }
    }
  }

  private async enrichSections(sections: IHomeSection[]): Promise<IHomeSection[]> {
    return this.storageUrlEnricher.enrichDeep(sections);
  }

  private async cleanupSections(): Promise<boolean> {
    await this.homeSectionsRepository.removeDuplicateTypes();
    return this.homeSectionsRepository.softDeleteByTypes(RETIRED_HOME_SECTION_TYPES);
  }

  private async seedMissingDefaults(): Promise<boolean> {
    let created = false;

    for (const section of DEFAULT_HOME_SECTIONS) {
      if (CUSTOM_HOME_SECTION_TYPES.has(section.type)) {
        continue;
      }
      const exists = await this.homeSectionsRepository.existsByType(section.type);
      if (exists) {
        continue;
      }

      await this.homeSectionsRepository.createSection({
        ...section,
        status: MasterStatus.ACTIVE,
        banners: null,
        productRefIds: null,
        categoryRefIds: null,
        pageTitle: null,
        pageDescription: null,
        pageCanonicalUrl: null,
        refId: await generateUniqueRefId(section.title, (refId) =>
          this.homeSectionsRepository.existsByRefId(refId),
        ),
        createdBy: 'system',
      });
      created = true;
    }

    return created;
  }

  private resolveSeoFields(
    type: HomeSectionType,
    dto: {
      pageTitle?: string | null;
      pageDescription?: string | null;
      pageCanonicalUrl?: string | null;
    },
  ): {
    pageTitle: string | null;
    pageDescription: string | null;
    pageCanonicalUrl: string | null;
  } {
    if (
      type !== HomeSectionType.PRODUCT_SLIDER &&
      type !== HomeSectionType.CATEGORY_SLIDER
    ) {
      return { pageTitle: null, pageDescription: null, pageCanonicalUrl: null };
    }

    return {
      pageTitle: dto.pageTitle?.trim() || null,
      pageDescription: dto.pageDescription?.trim() || null,
      pageCanonicalUrl: dto.pageCanonicalUrl?.trim() || null,
    };
  }

  private generateSlugFromTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private async invalidateHomeSectionsCache(): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.homeSectionsPattern(),
        CacheKeys.homepage.sectionsPattern(),
      ],
    });
  }
}
