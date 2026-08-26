import {

  BadRequestException,

  Injectable,

  NotFoundException,

} from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { FastifyRequest } from 'fastify';

import { WatchAndShopUpdatedEvent, CacheDomainAction, EVENTS } from '@packages/events';

import {
  buildPaginatedResult,
  buildPaginationOptions,
  formatValidationErrorMessage,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';

import { ProductsRepository } from '@modules/product/repositories/products.repository';

import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';

import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';

import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { IStorageFileReference } from '@packages/storage';
import { plainToInstance } from 'class-transformer';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { validate } from 'class-validator';

import { WatchAndShopRepository } from '../repositories/watch-and-shop.repository';

import {

  CreateWatchAndShopItemDto,

  ReorderWatchAndShopItemsDto,

  UpdateWatchAndShopItemDto,

  UpdateWatchAndShopItemStatusDto,

  WatchAndShopItemQueryDto,
  PublicWatchAndShopQueryDto,

} from '../dto/watch-and-shop.dto';

import {

  IStorefrontWatchAndShopItem,

  IWatchAndShopItem,

} from '../interfaces/watch-and-shop.interface';

import {

  mapWatchAndShopEntitiesToResponse,

  mapWatchAndShopEntityToResponse,

  mapWatchAndShopToStorefrontItem,

} from '../mappers/watch-and-shop.mapper';

import { WatchAndShopItemEntity } from '../entities/watch-and-shop-item.entity';

import { MasterStatus } from '../enums/master-status.enum';

import { WatchAndShopMediaType } from '../enums/watch-and-shop-media-type.enum';



const WATCH_AND_SHOP_MEDIA_FIELDS = ['mediaUrl'] as const;



const WATCH_AND_SHOP_UPLOAD_FIELDS = {

  mediaFile: UploadFolder.VIDEOS,

} as const;



@Injectable()

export class WatchAndShopService {

  constructor(

    private readonly watchAndShopRepository: WatchAndShopRepository,

    private readonly productsRepository: ProductsRepository,

    private readonly multipartFormService: MultipartFormService,

    private readonly eventEmitter: EventEmitter2,

    private readonly storageUrlEnricher: StorageUrlEnricher,

  ) {}



  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IWatchAndShopItem> {

    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(

      req,

      CreateWatchAndShopItemDto,

      WATCH_AND_SHOP_UPLOAD_FIELDS,

    );



    return this.create(dto, createdBy, uploadedUrls['mediaFile']);
  }

  async createFromJson(body: unknown, createdBy: string): Promise<IWatchAndShopItem> {
    const dto = await this.validateJsonDto(CreateWatchAndShopItemDto, body);
    return this.create(dto, createdBy);
  }

  async updateFromRequest(

    refId: string,

    req: FastifyRequest,

    updatedBy: string,

  ): Promise<IWatchAndShopItem> {

    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(

      req,

      UpdateWatchAndShopItemDto,

      WATCH_AND_SHOP_UPLOAD_FIELDS,

    );



    return this.update(refId, dto, updatedBy, uploadedUrls['mediaFile']);
  }

  async updateFromJson(
    refId: string,
    body: unknown,
    updatedBy: string,
  ): Promise<IWatchAndShopItem> {
    const dto = await this.validateJsonDto(UpdateWatchAndShopItemDto, body);
    return this.update(refId, dto, updatedBy);
  }

  async create(

    dto: CreateWatchAndShopItemDto,

    createdBy: string,

    uploadedMediaUrl?: string | null,

  ): Promise<IWatchAndShopItem> {

    const normalized = await this.normalizeAndValidateDto(dto, uploadedMediaUrl);

    this.validateSchedule(normalized.startsAt, normalized.endsAt);



    const entity = await this.watchAndShopRepository.create({

      title: normalized.title,

      mediaType: WatchAndShopMediaType.VIDEO,

      mediaUrl: normalized.mediaUrl,

      videoUrl: normalized.videoUrl,

      productRefId: normalized.productRefId,

      sortOrder: normalized.sortOrder ?? 0,

      status: normalized.status ?? MasterStatus.ACTIVE,

      startsAt: normalized.startsAt,

      endsAt: normalized.endsAt,

      refId: await generateUniqueRefId(

        dto.title ?? dto.productRefId,

        (id) => this.watchAndShopRepository.existsByRefId(id),

      ),

      createdBy,

    });



    await this.emitWatchAndShopUpdated(entity.refId, 'created');

    return this.enrichItem(mapWatchAndShopEntityToResponse(entity));

  }



  async findAll(

    query: WatchAndShopItemQueryDto,

  ): Promise<PaginatedResult<IWatchAndShopItem>> {

    const paginationOptions = buildPaginationOptions(query);

    const { data, total } = await this.watchAndShopRepository.findAllPaginated({

      ...paginationOptions,

      status: query.status,

    });



    const result = buildPaginatedResult(

      mapWatchAndShopEntitiesToResponse(data),

      total,

      paginationOptions,

    );



    return this.storageUrlEnricher.enrichPaginated(result, [...WATCH_AND_SHOP_MEDIA_FIELDS]);

  }



  async findOne(refId: string): Promise<IWatchAndShopItem> {

    const entity = await this.watchAndShopRepository.findByRefId(refId);

    if (!entity) {

      throw new NotFoundException(`Watch & Shop item with refId ${refId} not found`);

    }

    return this.enrichItem(mapWatchAndShopEntityToResponse(entity));

  }



  async update(

    refId: string,

    dto: UpdateWatchAndShopItemDto,

    updatedBy: string,

    uploadedMediaUrl?: string | null,

  ): Promise<IWatchAndShopItem> {

    const existing = await this.watchAndShopRepository.findByRefId(refId);

    if (!existing) {

      throw new NotFoundException(`Watch & Shop item with refId ${refId} not found`);

    }



    const merged: CreateWatchAndShopItemDto = {

      title: dto.title ?? existing.title ?? undefined,

      videoUrl: dto.videoUrl ?? existing.videoUrl ?? undefined,

      productRefId: dto.productRefId ?? existing.productRefId,

      sortOrder: dto.sortOrder ?? existing.sortOrder,

      status: dto.status ?? existing.status,

      startsAt: dto.startsAt ?? existing.startsAt?.toISOString(),

      endsAt: dto.endsAt ?? existing.endsAt?.toISOString(),

    };



    const normalized = await this.normalizeAndValidateDto(

      merged,

      uploadedMediaUrl,

      existing.mediaUrl,

    );

    this.validateSchedule(normalized.startsAt, normalized.endsAt);



    const result = await this.watchAndShopRepository.updateByRefId(refId, {

      title: normalized.title,

      mediaType: WatchAndShopMediaType.VIDEO,

      mediaUrl: normalized.mediaUrl,

      videoUrl: normalized.videoUrl,

      productRefId: normalized.productRefId,

      sortOrder: normalized.sortOrder,

      status: normalized.status,

      startsAt: normalized.startsAt,

      endsAt: normalized.endsAt,

      updatedBy,

    });



    if (!result) {

      throw new NotFoundException(`Watch & Shop item with refId ${refId} not found after update`);

    }



    await this.emitWatchAndShopUpdated(refId, 'updated');

    return this.enrichItem(mapWatchAndShopEntityToResponse(result));

  }



  async updateStatus(

    refId: string,

    dto: UpdateWatchAndShopItemStatusDto,

    updatedBy: string,

  ): Promise<IWatchAndShopItem> {

    const existing = await this.watchAndShopRepository.findByRefId(refId);

    if (!existing) {

      throw new NotFoundException(`Watch & Shop item with refId ${refId} not found`);

    }



    const updated = await this.watchAndShopRepository.updateByRefId(refId, {

      status: dto.status,

      updatedBy,

    });



    if (!updated) {

      throw new NotFoundException(

        `Watch & Shop item with refId ${refId} not found after status update`,

      );

    }



    await this.emitWatchAndShopUpdated(refId, 'status_updated');

    return this.enrichItem(mapWatchAndShopEntityToResponse(updated));

  }



  async reorder(

    dto: ReorderWatchAndShopItemsDto,

    updatedBy: string,

  ): Promise<IWatchAndShopItem[]> {

    for (const item of dto.items) {

      const existing = await this.watchAndShopRepository.findByRefId(item.refId);

      if (!existing) {

        throw new NotFoundException(`Watch & Shop item with refId ${item.refId} not found`);

      }

    }



    await this.watchAndShopRepository.updateSortOrders(

      dto.items.map((item) => ({ refId: item.refId, sortOrder: item.sortOrder })),

    );



    for (const item of dto.items) {

      await this.watchAndShopRepository.updateByRefId(item.refId, { updatedBy });

    }



    await this.emitWatchAndShopUpdated(dto.items[0].refId, 'updated');



    const results = await Promise.all(

      dto.items.map((item) => this.watchAndShopRepository.findByRefId(item.refId)),

    );



    return this.storageUrlEnricher.enrichManyFields(

      mapWatchAndShopEntitiesToResponse(

        results.filter((entity): entity is WatchAndShopItemEntity => !!entity),

      ),

      [...WATCH_AND_SHOP_MEDIA_FIELDS],

    );

  }



  async remove(refId: string): Promise<void> {

    const existing = await this.watchAndShopRepository.findByRefId(refId);

    if (!existing) {

      throw new NotFoundException(`Watch & Shop item with refId ${refId} not found`);

    }



    await this.watchAndShopRepository.softDeleteByRefId(refId);

    await this.emitWatchAndShopUpdated(refId, 'deleted');

  }



  async loadWatchAndShopUncached(
    limit?: number,
  ): Promise<IStorefrontWatchAndShopItem[]> {
    const items = await this.watchAndShopRepository.findActiveForStorefront(
      new Date(),
      limit,
    );

    return items.map(mapWatchAndShopToStorefrontItem);
  }

  async findActivePublicPaginated(
    query: PublicWatchAndShopQueryDto,
  ): Promise<PaginatedResult<IStorefrontWatchAndShopItem>> {
    const pagination = buildPaginationOptions(query);
    const { data, total } = await this.watchAndShopRepository.findAllPaginated({
      ...pagination,
      status: MasterStatus.ACTIVE,
      requirePlayableMedia: true,
      activeAt: new Date(),
    });

    const storefrontItems = data.map(mapWatchAndShopToStorefrontItem);
    const enriched = await this.storageUrlEnricher.enrichManyFields(
      storefrontItems,
      [...WATCH_AND_SHOP_MEDIA_FIELDS],
    );

    return buildPaginatedResult(enriched, total, pagination);
  }

  private async normalizeAndValidateDto(

    dto: CreateWatchAndShopItemDto,

    uploadedMediaUrl?: string | null,

    existingMediaUrl?: string | IStorageFileReference | null,

  ): Promise<{

    title: string | null;

    videoUrl: string | null;

    mediaUrl: ReturnType<StorageUrlEnricher['persist']>;

    productRefId: string;

    sortOrder: number;

    status: MasterStatus;

    startsAt: Date | null;

    endsAt: Date | null;

  }> {

    const videoUrl = dto.videoUrl?.trim() || null;

    const hasUpload = Boolean(uploadedMediaUrl);



    if (videoUrl && hasUpload) {

      throw new BadRequestException('Provide either a video URL or an uploaded file, not both');

    }



    if (!videoUrl && !hasUpload && !existingMediaUrl) {

      throw new BadRequestException('Either a video URL or an uploaded video file is required');

    }



    await this.assertProductExists(dto.productRefId);



    let mediaUrl = existingMediaUrl

      ? this.storageUrlEnricher.persist(existingMediaUrl)

      : null;

    let resolvedVideoUrl: string | null = videoUrl;



    if (hasUpload) {

      mediaUrl = this.storageUrlEnricher.persist(uploadedMediaUrl!);

      resolvedVideoUrl = null;

    } else if (videoUrl) {

      mediaUrl = null;

    }



    return {

      title: dto.title?.trim() || null,

      videoUrl: resolvedVideoUrl,

      mediaUrl,

      productRefId: dto.productRefId,

      sortOrder: dto.sortOrder ?? 0,

      status: dto.status ?? MasterStatus.ACTIVE,

      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,

      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,

    };

  }



  private validateSchedule(startsAt: Date | null, endsAt: Date | null): void {

    if (startsAt && endsAt && startsAt > endsAt) {

      throw new BadRequestException('startsAt must be before or equal to endsAt');

    }

  }



  private async assertProductExists(refId: string): Promise<void> {

    const product = await this.productsRepository.findPublishedByRefId(refId);

    if (!product) {

      throw new NotFoundException(`Published product with refId ${refId} not found`);

    }

  }



  private async emitWatchAndShopUpdated(

    refId: string,

    action: CacheDomainAction,

  ): Promise<void> {

    await this.eventEmitter.emitAsync(

      EVENTS.WATCH_AND_SHOP_UPDATED,

      new WatchAndShopUpdatedEvent(refId, action),

    );

  }



  private enrichItem(item: IWatchAndShopItem): Promise<IWatchAndShopItem> {

    if (!item.mediaUrl) {

      return Promise.resolve(item);

    }

    return this.storageUrlEnricher.enrichFields(item, [...WATCH_AND_SHOP_MEDIA_FIELDS]);

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


