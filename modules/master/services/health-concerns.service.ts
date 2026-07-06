import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import { EVENTS, HealthConcernUpdatedEvent } from '@packages/events';
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
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { PaginationQueryDto } from '@packages/common';
import { generateSlug } from '@packages/common/pagination.util';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { HealthConcernEntity } from '../entities/health-concern.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

const HEALTH_CONCERN_MEDIA_FIELDS = ['icon', 'banner'] as const;

const HEALTH_CONCERN_UPLOAD_FIELDS = {
  icon: UploadFolder.ICONS,
  banner: UploadFolder.BANNERS,
} as const;

@Injectable()
export class HealthConcernsService {
  constructor(
    private readonly healthConcernsRepository: HealthConcernsRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
    private readonly eventEmitter: EventEmitter2,
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
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IHealthConcern> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateHealthConcernDto,
      HEALTH_CONCERN_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, {
      icon: uploadedUrls['icon'],
      banner: uploadedUrls['banner'],
    });
  }

  async create(
    dto: CreateHealthConcernDto,
    media: { icon?: string | null; banner?: string | null } = {},
    createdBy: string,
  ): Promise<IHealthConcern> {
    const slug = dto.slug ?? generateSlug(dto.name);
    if (await this.healthConcernsRepository.existsBySlug(slug)) {
      throw new ConflictException(`A health concern with slug "${slug}" already exists`);
    }

    const entity = await this.healthConcernsRepository.create({
      name: dto.name,
      slug,
      icon: this.storageUrlEnricher.persist(media.icon),
      banner: this.storageUrlEnricher.persist(media.banner),
      description: dto.description ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      inHomePage: dto.inHomePage ?? false,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.healthConcernsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.emitHealthConcernUpdated(entity.refId, 'created');
    return this.enrichHealthConcern(mapHealthConcernEntityToResponse(entity));
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IHealthConcern>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.healthConcernsRepository.findAllPaginated(paginationOptions);
    const result = buildPaginatedResult(
      mapHealthConcernEntitiesToResponse(data),
      total,
      paginationOptions,
    );
    return this.storageUrlEnricher.enrichPaginated(result, [...HEALTH_CONCERN_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<IHealthConcern> {
    const entity = await this.healthConcernsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Health concern with refId ${refId} not found`);
    }
    return this.enrichHealthConcern(mapHealthConcernEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateHealthConcernDto,
    updatedBy: string,
    media: { icon?: string; banner?: string } = {},
  ): Promise<IHealthConcern> {
    const existing = await this.healthConcernsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Health concern with refId ${refId} not found`);
    }

    const slug = dto.slug ?? existing.slug;
    if (dto.slug && dto.slug !== existing.slug) {
      if (await this.healthConcernsRepository.existsBySlugExcluding(dto.slug, existing.id)) {
        throw new ConflictException(`A health concern with slug "${dto.slug}" already exists`);
      }
    }

    const payload: Partial<HealthConcernEntity> = { ...dto, updatedBy };
    if (dto.slug !== undefined) payload.slug = slug;
    if (media.icon !== undefined) payload.icon = this.storageUrlEnricher.persist(media.icon);
    if (media.banner !== undefined) payload.banner = this.storageUrlEnricher.persist(media.banner);

    const result = await this.healthConcernsRepository.updateByRefId(refId, payload);
    if (!result) {
      throw new NotFoundException(`Health concern with refId ${refId} not found after update`);
    }

    await this.emitHealthConcernUpdated(refId, 'updated');
    return this.enrichHealthConcern(mapHealthConcernEntityToResponse(result));
  }

  async updateStatus(
    refId: string,
    dto: UpdateHealthConcernStatusDto,
    updatedBy: string,
  ): Promise<IHealthConcern> {
    const existing = await this.healthConcernsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Health concern with refId ${refId} not found`);
    }

    const updated = await this.healthConcernsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Health concern with refId ${refId} not found after status update`);
    }

    await this.emitHealthConcernUpdated(refId, 'status_updated');
    return this.enrichHealthConcern(mapHealthConcernEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.healthConcernsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Health concern with refId ${refId} not found`);
    }
    await this.deletionGuard.assertHealthConcernDeletable(existing.id, existing.name);
    await this.healthConcernsRepository.softDeleteByRefId(refId);
    await this.emitHealthConcernUpdated(refId, 'deleted');
  }

  private async emitHealthConcernUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.HEALTH_CONCERN_UPDATED,
      new HealthConcernUpdatedEvent(refId, action),
    );
  }

  private enrichHealthConcern(healthConcern: IHealthConcern): Promise<IHealthConcern> {
    return this.storageUrlEnricher.enrichFields(healthConcern, [...HEALTH_CONCERN_MEDIA_FIELDS]);
  }
}
