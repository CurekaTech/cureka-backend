import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import {
  CmsPageQueryDto,
  CreateCmsPageDto,
  UpdateCmsPageDto,
  UpdateCmsPageStatusDto,
} from '../dto/cms-page.dto';
import { CmsPageEntity } from '../entities/cms-page.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { ICmsPage, IPublicCmsPage } from '../interfaces/cms-page.interface';
import {
  mapCmsPageEntitiesToResponse,
  mapCmsPageEntityToResponse,
  mapCmsPageToPublicResponse,
} from '../mappers/cms-page.mapper';
import { CmsPagesRepository } from '../repositories/cms-pages.repository';

@Injectable()
export class CmsPagesService {
  constructor(private readonly cmsPagesRepository: CmsPagesRepository) {}

  async findAll(query: CmsPageQueryDto): Promise<PaginatedResult<ICmsPage>> {
    const options = buildPaginationOptions(query);
    const { data, total } = await this.cmsPagesRepository.findAllPaginated({
      ...options,
      status: query.status,
    });
    return buildPaginatedResult(
      mapCmsPageEntitiesToResponse(data),
      total,
      options,
    );
  }

  async findOne(refId: string): Promise<ICmsPage> {
    const entity = await this.requireByRefId(refId);
    return mapCmsPageEntityToResponse(entity);
  }

  async findOneBySlug(slug: string): Promise<ICmsPage> {
    const normalized = slug.trim().toLowerCase();
    const entity = await this.cmsPagesRepository.findBySlug(normalized);
    if (!entity) {
      throw new NotFoundException(`CMS page with slug "${normalized}" not found`);
    }
    return mapCmsPageEntityToResponse(entity);
  }

  async findPublicBySlug(slug: string): Promise<IPublicCmsPage> {
    const normalized = slug.trim().toLowerCase();
    const entity = await this.cmsPagesRepository.findActiveBySlug(normalized);
    if (!entity) {
      throw new NotFoundException(`CMS page with slug "${normalized}" not found`);
    }
    return mapCmsPageToPublicResponse(entity);
  }

  async create(dto: CreateCmsPageDto, createdBy: string): Promise<ICmsPage> {
    const slug = dto.slug.trim().toLowerCase();
    if (await this.cmsPagesRepository.existsBySlug(slug)) {
      throw new BadRequestException(`Slug "${slug}" is already in use`);
    }

    const refId = await generateUniqueRefId(dto.title, (candidate) =>
      this.cmsPagesRepository.existsByRefId(candidate),
    );

    const entity = await this.cmsPagesRepository.create({
      refId,
      title: dto.title.trim(),
      slug,
      content: dto.content,
      metaTitle: dto.metaTitle?.trim() || null,
      metaDescription: dto.metaDescription?.trim() || null,
      status: dto.status ?? MasterStatus.ACTIVE,
      isPredefined: false,
      createdBy,
      updatedBy: createdBy,
    });

    return mapCmsPageEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateCmsPageDto, updatedBy: string): Promise<ICmsPage> {
    const existing = await this.requireByRefId(refId);

    if (dto.title !== undefined && !dto.title.trim()) {
      throw new BadRequestException('Title is required');
    }
    if (dto.content !== undefined && !String(dto.content).trim()) {
      throw new BadRequestException('Content is required');
    }

    if (dto.slug !== undefined) {
      const slug = dto.slug.trim().toLowerCase();
      if (existing.isPredefined && slug !== existing.slug) {
        throw new BadRequestException('Slug cannot be changed for predefined CMS pages');
      }
      if (slug !== existing.slug && (await this.cmsPagesRepository.existsBySlug(slug, refId))) {
        throw new BadRequestException(`Slug "${slug}" is already in use`);
      }
    }

    const updateData: Partial<CmsPageEntity> = { updatedBy };

    if (dto.title !== undefined) updateData.title = dto.title.trim();
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.metaTitle !== undefined) updateData.metaTitle = dto.metaTitle.trim() || null;
    if (dto.metaDescription !== undefined) {
      updateData.metaDescription = dto.metaDescription.trim() || null;
    }
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.slug !== undefined && !existing.isPredefined) {
      updateData.slug = dto.slug.trim().toLowerCase();
    }

    const updated = await this.cmsPagesRepository.updateByRefId(refId, updateData);
    return mapCmsPageEntityToResponse(updated!);
  }

  async updateStatus(
    refId: string,
    dto: UpdateCmsPageStatusDto,
    updatedBy: string,
  ): Promise<ICmsPage> {
    await this.requireByRefId(refId);
    const updated = await this.cmsPagesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });
    return mapCmsPageEntityToResponse(updated!);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.requireByRefId(refId);
    if (existing.isPredefined) {
      throw new BadRequestException('Predefined CMS pages cannot be deleted');
    }
    await this.cmsPagesRepository.softDeleteByRefId(refId);
  }

  private async requireByRefId(refId: string): Promise<CmsPageEntity> {
    const entity = await this.cmsPagesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`CMS page with refId "${refId}" not found`);
    }
    return entity;
  }
}
