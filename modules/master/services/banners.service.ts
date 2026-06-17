import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import {
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { BannerUpdatedEvent, CacheDomainAction, EVENTS } from '@packages/events';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { BannersRepository } from '../repositories/banners.repository';
import { BrandsRepository } from '../repositories/brands.repository';
import { CategoriesRepository } from '../repositories/categories.repository';
import {
  BannerQueryDto,
  CreateBannerDto,
  ReorderBannersDto,
  UpdateBannerDto,
  UpdateBannerStatusDto,
} from '../dto/banner.dto';
import { IBanner, IHomepageBannersBundle } from '../interfaces/banner.interface';
import {
  mapBannerEntitiesToResponse,
  mapBannerEntityToResponse,
  mapBannerToStorefrontItem,
} from '../mappers/banner.mapper';
import { BannerEntity } from '../entities/banner.entity';
import { BannerPlacement } from '../enums/banner-placement.enum';
import { BannerSlot } from '../enums/banner-slot.enum';
import { BannerResourceType } from '../enums/banner-resource-type.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';

const BANNER_MEDIA_FIELDS = ['imageUrl'] as const;

const BANNER_UPLOAD_FIELDS = {
  bannerImage: UploadFolder.BANNERS,
} as const;

@Injectable()
export class BannersService {
  constructor(
    private readonly bannersRepository: BannersRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IBanner> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateBannerDto,
      BANNER_UPLOAD_FIELDS,
    );

    const imageUrl = uploadedUrls['bannerImage'];
    if (!imageUrl) {
      throw new BadRequestException('Banner image is required');
    }

    return this.create(dto, imageUrl, createdBy);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IBanner> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateBannerDto,
      BANNER_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, uploadedUrls['bannerImage']);
  }

  async create(dto: CreateBannerDto, imageUrl: string, createdBy: string): Promise<IBanner> {
    const normalized = await this.normalizeAndValidateDto(dto);
    this.validateSchedule(normalized.startsAt, normalized.endsAt);

    const entity = await this.bannersRepository.create({
      placement: normalized.placement,
      slot: normalized.slot,
      resourceType: normalized.resourceType,
      resourceRefId: normalized.resourceRefId,
      externalUrl: normalized.externalUrl,
      title: normalized.title,
      imageUrl,
      sortOrder: normalized.sortOrder ?? 0,
      status: normalized.status ?? MasterStatus.ACTIVE,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      refId: await generateUniqueRefId(dto.title, (id) =>
        this.bannersRepository.existsByRefId(id),
      ),
      createdBy,
    });

    await this.emitBannerUpdated(entity.refId, 'created');
    return this.enrichBanner(mapBannerEntityToResponse(entity));
  }

  async findAll(query: BannerQueryDto): Promise<PaginatedResult<IBanner>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.bannersRepository.findAllPaginated({
      ...paginationOptions,
      placement: query.placement,
      slot: query.slot,
      status: query.status,
    });

    return this.storageUrlEnricher.enrichPaginated(
      buildPaginatedResult(mapBannerEntitiesToResponse(data), total, paginationOptions),
      [...BANNER_MEDIA_FIELDS],
    );
  }

  async findOne(refId: string): Promise<IBanner> {
    const entity = await this.bannersRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Banner with refId ${refId} not found`);
    }
    return this.enrichBanner(mapBannerEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateBannerDto,
    updatedBy: string,
    imageUrl?: string,
  ): Promise<IBanner> {
    const existing = await this.bannersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Banner with refId ${refId} not found`);
    }

    const merged: CreateBannerDto = {
      placement: dto.placement ?? existing.placement,
      slot: dto.slot ?? existing.slot,
      resourceType: dto.resourceType ?? existing.resourceType,
      resourceRefId: dto.resourceRefId ?? existing.resourceRefId ?? undefined,
      externalUrl: dto.externalUrl ?? existing.externalUrl ?? undefined,
      title: dto.title ?? existing.title,
      sortOrder: dto.sortOrder ?? existing.sortOrder,
      status: dto.status ?? existing.status,
      startsAt: dto.startsAt ?? existing.startsAt?.toISOString(),
      endsAt: dto.endsAt ?? existing.endsAt?.toISOString(),
    };

    const normalized = await this.normalizeAndValidateDto(merged, existing);
    this.validateSchedule(normalized.startsAt, normalized.endsAt);

    const payload: Partial<BannerEntity> = {
      placement: normalized.placement,
      slot: normalized.slot,
      resourceType: normalized.resourceType,
      resourceRefId: normalized.resourceRefId,
      externalUrl: normalized.externalUrl,
      title: normalized.title,
      sortOrder: normalized.sortOrder,
      status: normalized.status,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      updatedBy,
    };

    if (imageUrl !== undefined) {
      payload.imageUrl = imageUrl;
    }

    const result = await this.bannersRepository.updateByRefId(refId, payload);
    if (!result) {
      throw new NotFoundException(`Banner with refId ${refId} not found after update`);
    }

    await this.emitBannerUpdated(refId, 'updated');
    return this.enrichBanner(mapBannerEntityToResponse(result));
  }

  async updateStatus(
    refId: string,
    dto: UpdateBannerStatusDto,
    updatedBy: string,
  ): Promise<IBanner> {
    const existing = await this.bannersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Banner with refId ${refId} not found`);
    }

    const updated = await this.bannersRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Banner with refId ${refId} not found after status update`);
    }

    await this.emitBannerUpdated(refId, 'status_updated');
    return mapBannerEntityToResponse(updated);
  }

  async reorder(dto: ReorderBannersDto, updatedBy: string): Promise<IBanner[]> {
    for (const item of dto.items) {
      const existing = await this.bannersRepository.findByRefId(item.refId);
      if (!existing) {
        throw new NotFoundException(`Banner with refId ${item.refId} not found`);
      }
    }

    await this.bannersRepository.updateSortOrders(
      dto.items.map((item) => ({ refId: item.refId, sortOrder: item.sortOrder })),
    );

    for (const item of dto.items) {
      await this.bannersRepository.updateByRefId(item.refId, { updatedBy });
    }

    await this.emitBannerUpdated(dto.items[0].refId, 'updated');

    const results = await Promise.all(
      dto.items.map((item) => this.bannersRepository.findByRefId(item.refId)),
    );

    return mapBannerEntitiesToResponse(results.filter((entity): entity is BannerEntity => !!entity));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.bannersRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Banner with refId ${refId} not found`);
    }

    await this.bannersRepository.softDeleteByRefId(refId);
    await this.emitBannerUpdated(refId, 'deleted');
  }

  /** Public storefront read — cache-aside with Redis. */
  async getHomepageBanners(): Promise<IHomepageBannersBundle> {
    const bundle = await this.cacheStrategy.cacheAside({
      key: CacheKeys.homepage.banners(),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadHomepageBannersUncached(),
    });

    return this.enrichHomepageBanners(bundle);
  }

  /** PostgreSQL source of truth for homepage banner bundle. */
  async loadHomepageBannersUncached(): Promise<IHomepageBannersBundle> {
    const banners = await this.bannersRepository.findActiveForStorefront();
    const items = await Promise.all(
      banners.map(async (banner) => {
        const ctaHref = await this.resolveCtaHref(banner);
        return { banner, item: mapBannerToStorefrontItem(banner, ctaHref) };
      }),
    );

    const bundle: IHomepageBannersBundle = {
      hero: { primary: [], secondary: [] },
      mainPromo: [],
      brandWise: { left: [], right: [] },
    };

    for (const { banner, item } of items) {
      switch (banner.placement) {
        case BannerPlacement.HERO_PRIMARY:
          bundle.hero.primary.push(item);
          break;
        case BannerPlacement.HERO_SECONDARY:
          bundle.hero.secondary.push(item);
          break;
        case BannerPlacement.MAIN_PROMO:
          bundle.mainPromo.push(item);
          break;
        case BannerPlacement.BRAND_WISE:
          if (banner.slot === BannerSlot.LEFT) {
            bundle.brandWise.left.push(item);
          } else if (banner.slot === BannerSlot.RIGHT) {
            bundle.brandWise.right.push(item);
          }
          break;
      }
    }

    return bundle;
  }

  private async resolveCtaHref(banner: BannerEntity): Promise<string | null> {
    switch (banner.resourceType) {
      case BannerResourceType.BRAND: {
        if (!banner.resourceRefId) return null;
        const brand = await this.brandsRepository.findByRefId(banner.resourceRefId);
        return brand?.status === MasterStatus.ACTIVE ? `/brands/${brand.slug}` : null;
      }
      case BannerResourceType.CATEGORY: {
        if (!banner.resourceRefId) return null;
        const category = await this.categoriesRepository.findByRefId(banner.resourceRefId);
        return category?.status === MasterStatus.ACTIVE ? `/categories/${category.slug}` : null;
      }
      case BannerResourceType.PRODUCT:
        return banner.resourceRefId ? `/products/${banner.resourceRefId}` : null;
      case BannerResourceType.EXTERNAL_URL:
        return banner.externalUrl;
      default:
        return null;
    }
  }

  private async normalizeAndValidateDto(
    dto: CreateBannerDto,
    existing?: BannerEntity,
  ): Promise<{
    placement: BannerPlacement;
    slot: BannerSlot;
    resourceType: BannerResourceType;
    resourceRefId: string | null;
    externalUrl: string | null;
    title: string;
    sortOrder: number;
    status: MasterStatus;
    startsAt: Date | null;
    endsAt: Date | null;
  }> {
    const placement = dto.placement;
    let slot = dto.slot ?? BannerSlot.DEFAULT;

    if (placement === BannerPlacement.BRAND_WISE) {
      if (slot !== BannerSlot.LEFT && slot !== BannerSlot.RIGHT) {
        throw new BadRequestException(
          'Brand-wise banners require slot to be "left" or "right"',
        );
      }
    } else if (slot !== BannerSlot.DEFAULT) {
      slot = BannerSlot.DEFAULT;
    }

    const resourceType = dto.resourceType;
    let resourceRefId: string | null = dto.resourceRefId ?? null;
    let externalUrl: string | null = dto.externalUrl ?? null;

    switch (resourceType) {
      case BannerResourceType.BRAND:
        if (!resourceRefId) {
          throw new BadRequestException('resourceRefId is required when resourceType is brand');
        }
        await this.assertBrandExists(resourceRefId);
        externalUrl = null;
        break;
      case BannerResourceType.CATEGORY:
        if (!resourceRefId) {
          throw new BadRequestException('resourceRefId is required when resourceType is category');
        }
        await this.assertCategoryExists(resourceRefId);
        externalUrl = null;
        break;
      case BannerResourceType.PRODUCT:
        if (!resourceRefId) {
          throw new BadRequestException('resourceRefId is required when resourceType is product');
        }
        resourceRefId = resourceRefId;
        externalUrl = null;
        break;
      case BannerResourceType.EXTERNAL_URL:
        if (!externalUrl) {
          throw new BadRequestException('externalUrl is required when resourceType is external_url');
        }
        resourceRefId = null;
        break;
      case BannerResourceType.NONE:
        resourceRefId = null;
        externalUrl = null;
        break;
    }

    if (existing && placement !== existing.placement) {
      // Re-validate slot when placement changes
      if (placement === BannerPlacement.BRAND_WISE && slot === BannerSlot.DEFAULT) {
        throw new BadRequestException(
          'Brand-wise banners require slot to be "left" or "right"',
        );
      }
    }

    return {
      placement,
      slot,
      resourceType,
      resourceRefId,
      externalUrl,
      title: dto.title,
      sortOrder: dto.sortOrder ?? existing?.sortOrder ?? 0,
      status: dto.status ?? existing?.status ?? MasterStatus.ACTIVE,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    };
  }

  private validateSchedule(startsAt: Date | null, endsAt: Date | null): void {
    if (startsAt && endsAt && startsAt > endsAt) {
      throw new BadRequestException('startsAt must be before or equal to endsAt');
    }
  }

  private async assertBrandExists(refId: string): Promise<void> {
    const brand = await this.brandsRepository.findByRefId(refId);
    if (!brand) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }
  }

  private async assertCategoryExists(refId: string): Promise<void> {
    const category = await this.categoriesRepository.findByRefId(refId);
    if (!category) {
      throw new NotFoundException(`Category with refId ${refId} not found`);
    }
  }

  private async emitBannerUpdated(refId: string, action: CacheDomainAction): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.BANNER_UPDATED,
      new BannerUpdatedEvent(refId, action),
    );
  }

  private enrichBanner(banner: IBanner): Promise<IBanner> {
    return this.storageUrlEnricher.enrichFields(banner, [...BANNER_MEDIA_FIELDS]);
  }

  private async enrichHomepageBanners(bundle: IHomepageBannersBundle): Promise<IHomepageBannersBundle> {
    const enrichItems = async <T extends { imageUrl: string }>(items: T[]): Promise<T[]> =>
      this.storageUrlEnricher.enrichManyFields(items, ['imageUrl']);

    return {
      hero: {
        primary: await enrichItems(bundle.hero.primary),
        secondary: await enrichItems(bundle.hero.secondary),
      },
      mainPromo: await enrichItems(bundle.mainPromo),
      brandWise: {
        left: await enrichItems(bundle.brandWise.left),
        right: await enrichItems(bundle.brandWise.right),
      },
    };
  }
}
