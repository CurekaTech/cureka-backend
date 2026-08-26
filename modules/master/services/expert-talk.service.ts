import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FastifyRequest } from 'fastify';
import { ExpertTalkUpdatedEvent, CacheDomainAction, EVENTS } from '@packages/events';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  formatValidationErrorMessage,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { buildQueryCacheHash, CacheKeys, CacheModuleName, CacheStrategyService } from '@packages/cache';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { plainToInstance } from 'class-transformer';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { validate } from 'class-validator';
import { ExpertTalkRepository } from '../repositories/expert-talk.repository';
import {
  CreateExpertTalkItemDto,
  ExpertTalkItemQueryDto,
  PublicExpertTalkQueryDto,
  ReorderExpertTalkItemsDto,
  UpdateExpertTalkItemDto,
  UpdateExpertTalkItemStatusDto,
} from '../dto/expert-talk.dto';
import {
  IExpertTalkItem,
  IStorefrontExpertTalkItem,
} from '../interfaces/expert-talk.interface';
import {
  mapExpertTalkEntitiesToResponse,
  mapExpertTalkEntityToResponse,
  mapExpertTalkToStorefrontItem,
} from '../mappers/expert-talk.mapper';
import { ExpertTalkItemEntity } from '../entities/expert-talk-item.entity';
import { ExpertTalkContentType } from '../enums/expert-talk-content-type.enum';
import { MasterStatus } from '../enums/master-status.enum';

const EXPERT_TALK_MEDIA_FIELDS = ['thumbnail'] as const;

const EXPERT_TALK_UPLOAD_FIELDS = {
  thumbnailFile: UploadFolder.IMAGES,
} as const;

@Injectable()
export class ExpertTalkService {
  constructor(
    private readonly expertTalkRepository: ExpertTalkRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly eventEmitter: EventEmitter2,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly cacheStrategy: CacheStrategyService,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IExpertTalkItem> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateExpertTalkItemDto,
      EXPERT_TALK_UPLOAD_FIELDS,
    );

    return this.create(dto, createdBy, uploadedUrls['thumbnailFile']);
  }

  async createFromJson(body: unknown, createdBy: string): Promise<IExpertTalkItem> {
    const dto = await this.validateJsonDto(CreateExpertTalkItemDto, body);
    return this.create(dto, createdBy);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IExpertTalkItem> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateExpertTalkItemDto,
      EXPERT_TALK_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, uploadedUrls['thumbnailFile']);
  }

  async updateFromJson(
    refId: string,
    body: unknown,
    updatedBy: string,
  ): Promise<IExpertTalkItem> {
    const dto = await this.validateJsonDto(UpdateExpertTalkItemDto, body);
    return this.update(refId, dto, updatedBy);
  }

  async create(
    dto: CreateExpertTalkItemDto,
    createdBy: string,
    uploadedThumbnail?: string | null,
  ): Promise<IExpertTalkItem> {
    const normalized = this.normalizeDto(dto, uploadedThumbnail);

    const entity = await this.expertTalkRepository.create({
      title: normalized.title,
      description: normalized.description,
      videoUrl: normalized.videoUrl,
      thumbnail: normalized.thumbnail,
      contentType: normalized.contentType,
      sortOrder: normalized.sortOrder,
      status: normalized.status,
      refId: await generateUniqueRefId(
        dto.title,
        (id) => this.expertTalkRepository.existsByRefId(id),
      ),
      createdBy,
    });

    await this.emitExpertTalkUpdated(entity.refId, 'created');
    return this.enrichItem(mapExpertTalkEntityToResponse(entity));
  }

  async findAll(query: ExpertTalkItemQueryDto): Promise<PaginatedResult<IExpertTalkItem>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } = await this.expertTalkRepository.findAllPaginated({
      ...paginationOptions,
      status: query.status,
      contentType: query.contentType,
    });

    const result = buildPaginatedResult(
      mapExpertTalkEntitiesToResponse(data),
      total,
      paginationOptions,
    );

    return this.storageUrlEnricher.enrichPaginated(result, [...EXPERT_TALK_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<IExpertTalkItem> {
    const entity = await this.expertTalkRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Expert talk item with refId ${refId} not found`);
    }
    return this.enrichItem(mapExpertTalkEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateExpertTalkItemDto,
    updatedBy: string,
    uploadedThumbnail?: string | null,
  ): Promise<IExpertTalkItem> {
    const existing = await this.expertTalkRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Expert talk item with refId ${refId} not found`);
    }

    const merged: CreateExpertTalkItemDto = {
      title: dto.title ?? existing.title,
      description: dto.description ?? existing.description ?? undefined,
      videoUrl: dto.videoUrl ?? existing.videoUrl,
      contentType: dto.contentType ?? existing.contentType,
      sortOrder: dto.sortOrder ?? existing.sortOrder,
      status: dto.status ?? existing.status,
    };

    const normalized = this.normalizeDto(merged, uploadedThumbnail, existing.thumbnail);

    const result = await this.expertTalkRepository.updateByRefId(refId, {
      title: normalized.title,
      description: normalized.description,
      videoUrl: normalized.videoUrl,
      thumbnail: normalized.thumbnail,
      contentType: normalized.contentType,
      sortOrder: normalized.sortOrder,
      status: normalized.status,
      updatedBy,
    });

    if (!result) {
      throw new NotFoundException(`Expert talk item with refId ${refId} not found after update`);
    }

    await this.emitExpertTalkUpdated(refId, 'updated');
    return this.enrichItem(mapExpertTalkEntityToResponse(result));
  }

  async updateStatus(
    refId: string,
    dto: UpdateExpertTalkItemStatusDto,
    updatedBy: string,
  ): Promise<IExpertTalkItem> {
    const existing = await this.expertTalkRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Expert talk item with refId ${refId} not found`);
    }

    const updated = await this.expertTalkRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Expert talk item with refId ${refId} not found after status update`,
      );
    }

    await this.emitExpertTalkUpdated(refId, 'status_updated');
    return this.enrichItem(mapExpertTalkEntityToResponse(updated));
  }

  async reorder(
    dto: ReorderExpertTalkItemsDto,
    updatedBy: string,
  ): Promise<IExpertTalkItem[]> {
    for (const item of dto.items) {
      const existing = await this.expertTalkRepository.findByRefId(item.refId);
      if (!existing) {
        throw new NotFoundException(`Expert talk item with refId ${item.refId} not found`);
      }
    }

    await this.expertTalkRepository.updateSortOrders(
      dto.items.map((item) => ({ refId: item.refId, sortOrder: item.sortOrder })),
    );

    for (const item of dto.items) {
      await this.expertTalkRepository.updateByRefId(item.refId, { updatedBy });
    }

    await this.emitExpertTalkUpdated(dto.items[0].refId, 'updated');

    const results = await Promise.all(
      dto.items.map((item) => this.expertTalkRepository.findByRefId(item.refId)),
    );

    return this.storageUrlEnricher.enrichManyFields(
      mapExpertTalkEntitiesToResponse(
        results.filter((entity): entity is ExpertTalkItemEntity => !!entity),
      ),
      [...EXPERT_TALK_MEDIA_FIELDS],
    );
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.expertTalkRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Expert talk item with refId ${refId} not found`);
    }

    await this.expertTalkRepository.softDeleteByRefId(refId);
    await this.emitExpertTalkUpdated(refId, 'deleted');
  }

  async loadExpertTalksUncached(
    limit?: number,
  ): Promise<IStorefrontExpertTalkItem[]> {
    const items = await this.expertTalkRepository.findActiveForStorefront(limit);
    return items.map(mapExpertTalkToStorefrontItem);
  }

  async findAllPublic(
    query: PublicExpertTalkQueryDto,
  ): Promise<PaginatedResult<IStorefrontExpertTalkItem>> {
    const queryHash = buildQueryCacheHash({
      page: query.page,
      limit: query.limit,
      contentType: query.contentType,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.expertTalks.list(queryHash),
      module: CacheModuleName.HOMEPAGE,
      loader: () => this.loadAllPublicUncached(query),
    });
  }

  private async loadAllPublicUncached(
    query: PublicExpertTalkQueryDto,
  ): Promise<PaginatedResult<IStorefrontExpertTalkItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.expertTalkRepository.findAllPaginated({
      ...pagination,
      status: MasterStatus.ACTIVE,
      contentType: query.contentType,
      requireVideoUrl: true,
    });

    const storefrontItems = data.map(mapExpertTalkToStorefrontItem);
    const enriched = await this.storageUrlEnricher.enrichManyFields(
      storefrontItems,
      [...EXPERT_TALK_MEDIA_FIELDS],
    );

    const publicItems = enriched.map((item) => ({
      refId: item.refId,
      title: item.title,
      description: item.description,
      videoUrl: item.videoUrl,
      thumbnail: item.thumbnail,
      contentType: item.contentType,
      sortOrder: item.sortOrder,
    }));

    return buildPaginatedResult(publicItems, total, pagination);
  }

  private normalizeDto(
    dto: CreateExpertTalkItemDto,
    uploadedThumbnail?: string | null,
    existingThumbnail?: ExpertTalkItemEntity['thumbnail'],
  ): {
    title: string;
    description: string | null;
    videoUrl: string;
    thumbnail: ReturnType<StorageUrlEnricher['persist']>;
    contentType: ExpertTalkContentType;
    sortOrder: number;
    status: MasterStatus;
  } {
    const videoUrl = dto.videoUrl?.trim();
    if (!videoUrl) {
      throw new BadRequestException('YouTube video URL is required');
    }

    if (!this.isYouTubeUrl(videoUrl)) {
      throw new BadRequestException('Only YouTube video URLs are supported');
    }

    let thumbnail = existingThumbnail
      ? this.storageUrlEnricher.persist(existingThumbnail)
      : null;

    if (uploadedThumbnail) {
      thumbnail = this.storageUrlEnricher.persist(uploadedThumbnail);
    }

    return {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      videoUrl,
      thumbnail,
      contentType: dto.contentType ?? ExpertTalkContentType.TALK,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? MasterStatus.ACTIVE,
    };
  }

  private isYouTubeUrl(url: string): boolean {
    return /(?:youtube\.com|youtu\.be)/i.test(url);
  }

  private async emitExpertTalkUpdated(
    refId: string,
    action: CacheDomainAction,
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.EXPERT_TALK_UPDATED,
      new ExpertTalkUpdatedEvent(refId, action),
    );
  }

  private enrichItem(item: IExpertTalkItem): Promise<IExpertTalkItem> {
    if (!item.thumbnail) {
      return Promise.resolve(item);
    }
    return this.storageUrlEnricher.enrichFields(item, [...EXPERT_TALK_MEDIA_FIELDS]);
  }

  private async validateJsonDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    body: unknown,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, body, { enableImplicitConversion: false });
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException(formatValidationErrorMessage(errors));
    }

    return instance;
  }
}
