import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { BrandsRepository } from '../repositories/brands.repository';
import {
  BrandHighlightDto,
  CreateBrandDto,
  UpdateBrandDto,
  UpdateBrandStatusDto,
} from '../dto/brand.dto';
import { IBrand } from '../interfaces/brand.interface';
import { MasterStatus } from '../enums/master-status.enum';
import { mapBrandEntityToResponse, mapBrandEntitiesToResponse } from '../mappers/brand.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { generateSlug } from '@packages/common/pagination.util';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { BrandEntity } from '../entities/brand.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';
import { BrandUpdatedEvent, EVENTS } from '@packages/events';
import { IStorageFileReference } from '@packages/storage';

const BRAND_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
  banner: UploadFolder.BANNERS,
  video: UploadFolder.VIDEOS,
  featuredBanner: UploadFolder.BANNERS,
  promotionalBanner: UploadFolder.BANNERS,
  secondaryBanner: UploadFolder.BANNERS,
  secondaryVideo: UploadFolder.VIDEOS,
} as const;

type BrandMediaInput = {
  logo?: string | null;
  banner?: string | null;
  video?: string | null;
  featuredBanner?: string | null;
  promotionalBanner?: string | null;
  secondaryBanner?: string | null;
  secondaryVideo?: string | null;
};

@Injectable()
export class BrandsService {
  constructor(
    private readonly brandsRepository: BrandsRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IBrand> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateBrandDto,
      BRAND_UPLOAD_FIELDS,
    );

    return this.create(
      dto,
      {
        logo: uploadedUrls['logo'] ?? null,
        banner: uploadedUrls['banner'] ?? null,
        video: uploadedUrls['video'] ?? null,
        featuredBanner: uploadedUrls['featuredBanner'] ?? null,
        promotionalBanner: uploadedUrls['promotionalBanner'] ?? null,
        secondaryBanner: uploadedUrls['secondaryBanner'] ?? null,
        secondaryVideo: uploadedUrls['secondaryVideo'] ?? null,
      },
      createdBy,
    );
  }

  async updateFromRequest(refId: string, req: FastifyRequest, updatedBy: string): Promise<IBrand> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateBrandDto,
      BRAND_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, {
      logo: uploadedUrls['logo'],
      banner: uploadedUrls['banner'],
      video: uploadedUrls['video'],
      featuredBanner: uploadedUrls['featuredBanner'],
      promotionalBanner: uploadedUrls['promotionalBanner'],
      secondaryBanner: uploadedUrls['secondaryBanner'],
      secondaryVideo: uploadedUrls['secondaryVideo'],
    });
  }

  async create(
    dto: CreateBrandDto,
    media: BrandMediaInput = {},
    createdBy: string,
  ): Promise<IBrand> {
    const slug = dto.slug ?? generateSlug(dto.name);
    const slugExists = await this.brandsRepository.existsBySlug(slug);
    if (slugExists) {
      throw new ConflictException(`A brand with slug "${slug}" already exists`);
    }

    const entity = await this.brandsRepository.create({
      name: dto.name,
      slug,
      logo: this.storageUrlEnricher.persist(media.logo),
      banner: this.storageUrlEnricher.persist(media.banner),
      video: this.storageUrlEnricher.persist(media.video),
      featuredBanner: this.storageUrlEnricher.persist(media.featuredBanner),
      promotionalBanner: this.storageUrlEnricher.persist(media.promotionalBanner),
      secondaryBanner: this.storageUrlEnricher.persist(media.secondaryBanner),
      secondaryVideo: this.storageUrlEnricher.persist(media.secondaryVideo),
      brandHighlights: this.persistBrandHighlights(dto.brandHighlights),
      description: dto.description ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      inHomePage: dto.inHomePage ?? false,
      metaTitle: dto.metaTitle ?? null,
      metaDescription: dto.metaDescription ?? null,
      metaKeywords: dto.metaKeywords ?? null,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.brandsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    const brand = await this.enrichBrand(mapBrandEntityToResponse(entity));
    await this.emitBrandUpdated(brand.refId, 'created');
    return brand;
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IBrand>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.brandsRepository.findAllPaginated(paginationOptions);
    const result = buildPaginatedResult(mapBrandEntitiesToResponse(data), total, paginationOptions);
    return {
      ...result,
      data: await Promise.all(result.data.map((item) => this.enrichBrand(item))),
    };
  }

  async findOne(refId: string): Promise<IBrand> {
    const entity = await this.brandsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }
    return this.enrichBrand(mapBrandEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateBrandDto,
    updatedBy: string,
    media: BrandMediaInput = {},
  ): Promise<IBrand> {
    const existing = await this.brandsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }

    const slug = dto.slug ?? existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const slugConflict = await this.brandsRepository.existsBySlugExcluding(
        dto.slug,
        existing.id,
      );
      if (slugConflict) {
        throw new ConflictException(`A brand with slug "${dto.slug}" already exists`);
      }
    }

    const { brandHighlights, ...dtoFields } = dto;
    const payload: Partial<BrandEntity> = { ...dtoFields, updatedBy };
    if (dto.slug !== undefined) payload.slug = slug;
    if (media.logo !== undefined) payload.logo = this.storageUrlEnricher.persist(media.logo);
    if (media.banner !== undefined) payload.banner = this.storageUrlEnricher.persist(media.banner);
    if (media.video !== undefined) payload.video = this.storageUrlEnricher.persist(media.video);
    if (media.featuredBanner !== undefined) {
      payload.featuredBanner = this.storageUrlEnricher.persist(media.featuredBanner);
    }
    if (media.promotionalBanner !== undefined) {
      payload.promotionalBanner = this.storageUrlEnricher.persist(media.promotionalBanner);
    }
    if (media.secondaryBanner !== undefined) {
      payload.secondaryBanner = this.storageUrlEnricher.persist(media.secondaryBanner);
    }
    if (media.secondaryVideo !== undefined) {
      payload.secondaryVideo = this.storageUrlEnricher.persist(media.secondaryVideo);
    }
    if (brandHighlights !== undefined) {
      payload.brandHighlights = this.persistBrandHighlights(brandHighlights);
    }

    const result = await this.brandsRepository.updateByRefId(refId, payload);
    if (!result) {
      throw new NotFoundException(`Brand with refId ${refId} not found after update`);
    }

    const brand = await this.enrichBrand(mapBrandEntityToResponse(result));
    await this.emitBrandUpdated(refId, 'updated');
    return brand;
  }

  async updateStatus(
    refId: string,
    dto: UpdateBrandStatusDto,
    updatedBy: string,
  ): Promise<IBrand> {
    const existing = await this.brandsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }

    const updated = await this.brandsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Brand with refId ${refId} not found after status update`);
    }

    const brand = await this.enrichBrand(mapBrandEntityToResponse(updated));
    await this.emitBrandUpdated(refId, 'status_updated');
    return brand;
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.brandsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }
    await this.deletionGuard.assertBrandDeletable(existing.id, existing.name);
    await this.brandsRepository.softDeleteByRefId(refId);
    await this.emitBrandUpdated(refId, 'deleted');
  }

  private persistBrandHighlights(
    highlights: BrandHighlightDto[] | null | undefined,
  ): BrandEntity['brandHighlights'] {
    if (highlights === undefined) return null;
    if (highlights === null) return null;
    return highlights.map((item) => ({
      icon: this.storageUrlEnricher.persist(
        item.icon as string | IStorageFileReference | null | undefined,
      ),
      title: String(item.title ?? '').trim(),
      subtitle: String(item.subtitle ?? '').trim(),
    }));
  }

  private async emitBrandUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.brandsWeTrustPattern(),
        CacheKeys.homepage.sectionsPattern(),
        CacheKeys.publicProducts.listPattern(),
        CacheKeys.brands.listPattern(),
      ],
    });
    await this.eventEmitter.emitAsync(
      EVENTS.BRAND_UPDATED,
      new BrandUpdatedEvent(refId, action),
    );
  }

  /** Sign top-level media + nested brandHighlights[].icon. */
  private enrichBrand(brand: IBrand): Promise<IBrand> {
    return this.storageUrlEnricher.enrichDeep(brand);
  }
}
