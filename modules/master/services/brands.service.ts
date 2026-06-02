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
  generateRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@common/dto/pagination-query.dto';
import { generateSlug } from '@packages/common/pagination.util';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { BrandEntity } from '../entities/brand.entity';

const BRAND_UPLOAD_FIELDS = {
  logo: UploadFolder.LOGOS,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class BrandsService {
  constructor(
    private readonly brandsRepository: BrandsRepository,
    private readonly multipartFormService: MultipartFormService,
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

  async updateFromRequest(id: string, req: FastifyRequest, updatedBy: string): Promise<IBrand> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateBrandDto,
      BRAND_UPLOAD_FIELDS,
    );

    return this.update(id, dto, updatedBy, {
      logo: uploadedUrls['logo'],
      banner: uploadedUrls['banner'],
    });
  }

  async create(
    dto: CreateBrandDto,
    media: { logo?: string | null; banner?: string | null } = {},
    createdBy: string,
  ): Promise<IBrand> {
    const nameExists = await this.brandsRepository.existsByName(dto.name);
    if (nameExists) {
      throw new ConflictException(`A brand with name "${dto.name}" already exists`);
    }

    const slug = dto.slug ?? generateSlug(dto.name);
    const slugExists = await this.brandsRepository.existsBySlug(slug);
    if (slugExists) {
      throw new ConflictException(`A brand with slug "${slug}" already exists`);
    }

    const entity = await this.brandsRepository.create({
      name: dto.name,
      slug,
      logo: media.logo ?? null,
      banner: media.banner ?? null,
      description: dto.description ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      metaTitle: dto.metaTitle ?? null,
      metaDescription: dto.metaDescription ?? null,
      metaKeywords: dto.metaKeywords ?? null,
      refId: generateRefId(dto.name),
      createdBy,
    });

    return mapBrandEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IBrand>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.brandsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapBrandEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IBrand> {
    const entity = await this.brandsRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    return mapBrandEntityToResponse(entity);
  }

  async update(
    id: string,
    dto: UpdateBrandDto,
    updatedBy: string,
    media: { logo?: string; banner?: string } = {},
  ): Promise<IBrand> {
    const existing = await this.brandsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const nameConflict = await this.brandsRepository.existsByNameExcluding(dto.name, id);
      if (nameConflict) {
        throw new ConflictException(`A brand with name "${dto.name}" already exists`);
      }
    }

    const slug = dto.slug ?? existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      const slugConflict = await this.brandsRepository.existsBySlugExcluding(dto.slug, id);
      if (slugConflict) {
        throw new ConflictException(`A brand with slug "${dto.slug}" already exists`);
      }
    }

    const payload: Partial<BrandEntity> = { ...dto, updatedBy };
    if (dto.slug !== undefined) payload.slug = slug;
    if (media.logo !== undefined) payload.logo = media.logo;
    if (media.banner !== undefined) payload.banner = media.banner;

    const result = await this.brandsRepository.update(id, payload);
    if (!result) {
      throw new NotFoundException(`Brand with id ${id} not found after update`);
    }

    return mapBrandEntityToResponse(result);
  }

  async updateStatus(
    id: string,
    dto: UpdateBrandStatusDto,
    updatedBy: string,
  ): Promise<IBrand> {
    const existing = await this.brandsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }

    const updated = await this.brandsRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Brand with id ${id} not found after status update`);
    }

    return mapBrandEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.brandsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    await this.brandsRepository.softDelete(id);
  }
}
