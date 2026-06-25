import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { BrandsRepository } from '../repositories/brands.repository';
import { CreateBrandDto, UpdateBrandDto, UpdateBrandStatusDto } from '../dto/brand.dto';
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

const BRAND_MEDIA_FIELDS = ['logo', 'banner'] as const;

const BRAND_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class BrandsService {
  constructor(
    private readonly brandsRepository: BrandsRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
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
    });
  }

  async create(
    dto: CreateBrandDto,
    media: { logo?: string | null; banner?: string | null } = {},
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

    return this.enrichBrand(mapBrandEntityToResponse(entity));
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IBrand>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.brandsRepository.findAllPaginated(paginationOptions);
    const result = buildPaginatedResult(mapBrandEntitiesToResponse(data), total, paginationOptions);
    return this.storageUrlEnricher.enrichPaginated(result, [...BRAND_MEDIA_FIELDS]);
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
    media: { logo?: string; banner?: string } = {},
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

    const payload: Partial<BrandEntity> = { ...dto, updatedBy };
    if (dto.slug !== undefined) payload.slug = slug;
    if (media.logo !== undefined) payload.logo = this.storageUrlEnricher.persist(media.logo);
    if (media.banner !== undefined) payload.banner = this.storageUrlEnricher.persist(media.banner);

    const result = await this.brandsRepository.updateByRefId(refId, payload);
    if (!result) {
      throw new NotFoundException(`Brand with refId ${refId} not found after update`);
    }

    return this.enrichBrand(mapBrandEntityToResponse(result));
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

    return this.enrichBrand(mapBrandEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.brandsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Brand with refId ${refId} not found`);
    }
    await this.deletionGuard.assertBrandDeletable(existing.id, existing.name);
    await this.brandsRepository.softDeleteByRefId(refId);
  }

  private enrichBrand(brand: IBrand): Promise<IBrand> {
    return this.storageUrlEnricher.enrichFields(brand, [...BRAND_MEDIA_FIELDS]);
  }
}

