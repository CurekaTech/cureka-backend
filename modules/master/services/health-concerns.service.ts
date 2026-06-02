import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { HealthConcernsRepository } from '../repositories/health-concerns.repository';
import {
  CreateHealthConcernDto,
  UpdateHealthConcernDto,
  UpdateHealthConcernStatusDto,
} from '../dto/health-concern.dto';
import { IHealthConcern } from '../interfaces/health-concern.interface';
import {
  mapHealthConcernEntityToResponse,
  mapHealthConcernEntitiesToResponse,
} from '../mappers/health-concern.mapper';
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
import { HealthConcernEntity } from '../entities/health-concern.entity';
import { MasterStatus } from '../enums/master-status.enum';

const HEALTH_CONCERN_UPLOAD_FIELDS = {
  icon: UploadFolder.ICONS,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class HealthConcernsService {
  constructor(
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly multipartFormService: MultipartFormService,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IHealthConcern> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateHealthConcernDto,
      HEALTH_CONCERN_UPLOAD_FIELDS,
    );

    return this.create(
      dto,
      {
        icon: uploadedUrls['icon'] ?? null,
        banner: uploadedUrls['banner'] ?? null,
      },
      createdBy,
    );
  }

  async updateFromRequest(
    id: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IHealthConcern> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateHealthConcernDto,
      HEALTH_CONCERN_UPLOAD_FIELDS,
    );

    return this.update(id, dto, updatedBy, {
      icon: uploadedUrls['icon'],
      banner: uploadedUrls['banner'],
    });
  }

  async create(
    dto: CreateHealthConcernDto,
    media: { icon?: string | null; banner?: string | null } = {},
    createdBy: string,
  ): Promise<IHealthConcern> {
    if (await this.healthConcernsRepository.existsByName(dto.name)) {
      throw new ConflictException(`A health concern with name "${dto.name}" already exists`);
    }

    const slug = dto.slug ?? generateSlug(dto.name);
    if (await this.healthConcernsRepository.existsBySlug(slug)) {
      throw new ConflictException(`A health concern with slug "${slug}" already exists`);
    }

    const entity = await this.healthConcernsRepository.create({
      name: dto.name,
      slug,
      icon: media.icon ?? null,
      banner: media.banner ?? null,
      description: dto.description ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: generateRefId(dto.name),
      createdBy,
    });

    return mapHealthConcernEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IHealthConcern>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.healthConcernsRepository.findAllPaginated(paginationOptions);
    return buildPaginatedResult(mapHealthConcernEntitiesToResponse(data), total, paginationOptions);
  }

  async findOne(id: string): Promise<IHealthConcern> {
    const entity = await this.healthConcernsRepository.findById(id);
    if (!entity) {
      throw new NotFoundException(`Health concern with id ${id} not found`);
    }
    return mapHealthConcernEntityToResponse(entity);
  }

  async update(
    id: string,
    dto: UpdateHealthConcernDto,
    updatedBy: string,
    media: { icon?: string; banner?: string } = {},
  ): Promise<IHealthConcern> {
    const existing = await this.healthConcernsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Health concern with id ${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      if (await this.healthConcernsRepository.existsByNameExcluding(dto.name, id)) {
        throw new ConflictException(`A health concern with name "${dto.name}" already exists`);
      }
    }

    const slug = dto.slug ?? existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.healthConcernsRepository.existsBySlugExcluding(dto.slug, id)) {
        throw new ConflictException(`A health concern with slug "${dto.slug}" already exists`);
      }
    }

    const payload: Partial<HealthConcernEntity> = { ...dto, updatedBy };
    if (dto.slug !== undefined) payload.slug = slug;
    if (media.icon !== undefined) payload.icon = media.icon;
    if (media.banner !== undefined) payload.banner = media.banner;

    const result = await this.healthConcernsRepository.update(id, payload);
    if (!result) {
      throw new NotFoundException(`Health concern with id ${id} not found after update`);
    }

    return mapHealthConcernEntityToResponse(result);
  }

  async updateStatus(
    id: string,
    dto: UpdateHealthConcernStatusDto,
    updatedBy: string,
  ): Promise<IHealthConcern> {
    const existing = await this.healthConcernsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Health concern with id ${id} not found`);
    }

    const updated = await this.healthConcernsRepository.update(id, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Health concern with id ${id} not found after status update`);
    }

    return mapHealthConcernEntityToResponse(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.healthConcernsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Health concern with id ${id} not found`);
    }
    await this.healthConcernsRepository.softDelete(id);
  }
}
