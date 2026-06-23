import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { generateUniqueRefId } from '@packages/common';
import {
  CreateHomeSectionDto,
  ReorderHomeSectionsDto,
  UpdateHomeSectionStatusDto,
} from '../dto/home-section.dto';
import { HomeSectionType } from '../enums/home-section-type.enum';
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

const DEFAULT_HOME_SECTIONS: Array<{
  title: string;
  slug: string;
  type: HomeSectionType;
  sectionIndex: number;
}> = [
  {
    title: 'Built By Doctors Banner',
    slug: 'built-by-doctors-banner',
    type: HomeSectionType.BUILT_BY_DOCTORS_BANNER,
    sectionIndex: 1,
  },
  {
    title: 'Shop By Category',
    slug: 'shop-by-category',
    type: HomeSectionType.SHOP_BY_CATEGORY,
    sectionIndex: 2,
  },
  { title: 'Best Sellers', slug: 'best-sellers', type: HomeSectionType.BEST_SELLERS, sectionIndex: 3 },
  {
    title: 'Expert Curated Bundles',
    slug: 'expert-curated-bundles',
    type: HomeSectionType.EXPERT_CURATED_BUNDLES,
    sectionIndex: 4,
  },
  {
    title: 'Festival Banners',
    slug: 'festival-banners',
    type: HomeSectionType.FESTIVAL_BANNERS,
    sectionIndex: 5,
  },
  {
    title: 'Brand Banners',
    slug: 'brand-banners',
    type: HomeSectionType.BRAND_BANNERS,
    sectionIndex: 6,
  },
  {
    title: 'Curated Wellness Essentials',
    slug: 'curated-wellness-essentials',
    type: HomeSectionType.CURATED_WELLNESS_ESSENTIALS,
    sectionIndex: 7,
  },
  {
    title: 'Consult Doctors',
    slug: 'consult-doctors',
    type: HomeSectionType.CONSULT_DOCTORS,
    sectionIndex: 8,
  },
  { title: 'Health Reads', slug: 'health-reads', type: HomeSectionType.HEALTH_READS, sectionIndex: 9 },
  {
    title: 'Watch And Shop',
    slug: 'watch-and-shop',
    type: HomeSectionType.WATCH_AND_SHOP,
    sectionIndex: 10,
  },
];

@Injectable()
export class HomeSectionsService implements OnModuleInit {
  constructor(
    private readonly homeSectionsRepository: HomeSectionsRepository,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.cleanupSections();
      await this.seedMissingDefaults();
    } catch (error) {
      console.warn(
        '[HomeSectionsService] Skipping default seed — run database migrations first.',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async findAll(): Promise<IHomeSectionListResponse> {
    await this.cleanupSections();
    const seeded = await this.seedMissingDefaults();
    if (seeded) {
      await this.invalidateHomeSectionsCache();
    }

    const sections = await this.homeSectionsRepository.findAllSorted();
    return { sections: mapHomeSectionEntitiesToResponse(sections) };
  }

  async findActive(): Promise<IHomeSectionListResponse> {
    await this.cleanupSections();
    const seeded = await this.seedMissingDefaults();
    if (seeded) {
      await this.invalidateHomeSectionsCache();
    }

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.homeSections(),
      module: CacheModuleName.HOMEPAGE,
      loader: async () => {
        const sections = await this.homeSectionsRepository.findActiveSorted();
        return { sections: mapHomeSectionEntitiesToResponse(sections) };
      },
    });
  }

  async create(dto: CreateHomeSectionDto, createdBy: string): Promise<IHomeSection> {
    if (dto.type === HomeSectionType.HERO_BANNER) {
      throw new BadRequestException('Hero banner is static on the storefront and cannot be managed here');
    }

    const existingType = await this.homeSectionsRepository.existsByType(dto.type);
    if (existingType) {
      throw new BadRequestException(`A section with type "${dto.type}" already exists`);
    }

    const maxIndex = await this.homeSectionsRepository.getMaxSectionIndex();
    const sectionIndex = dto.index ?? maxIndex + 1;
    const slug = this.generateSlugFromTitle(dto.title);

    const entity = await this.homeSectionsRepository.createSection({
      title: dto.title,
      slug,
      type: dto.type,
      sectionIndex,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.title, (refId) =>
        this.homeSectionsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.invalidateHomeSectionsCache();
    return mapHomeSectionEntityToResponse(entity);
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
    return mapHomeSectionEntityToResponse(updated);
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

  private async cleanupSections(): Promise<void> {
    await this.homeSectionsRepository.softDeleteHeroBanners();
    await this.homeSectionsRepository.removeDuplicateTypes();
  }

  private async seedMissingDefaults(): Promise<boolean> {
    let created = false;

    for (const section of DEFAULT_HOME_SECTIONS) {
      const exists = await this.homeSectionsRepository.existsByType(section.type);
      if (exists) {
        continue;
      }

      await this.homeSectionsRepository.createSection({
        ...section,
        status: MasterStatus.ACTIVE,
        refId: await generateUniqueRefId(section.title, (refId) =>
          this.homeSectionsRepository.existsByRefId(refId),
        ),
        createdBy: 'system',
      });
      created = true;
    }

    return created;
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
      patterns: [CacheKeys.homepage.homeSectionsPattern()],
    });
  }
}
