import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheKeys, CacheStrategyService } from '@packages/cache';
import { WellnessGoalsRepository } from '../repositories/wellness-goals.repository';
import {
  CreateWellnessGoalDto,
  UpdateWellnessGoalDto,
  UpdateWellnessGoalStatusDto,
} from '../dto/wellness-goal.dto';
import { IWellnessGoal } from '../interfaces/wellness-goal.interface';
import {
  mapWellnessGoalEntitiesToResponse,
  mapWellnessGoalEntityToResponse,
} from '../mappers/wellness-goal.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';
import { MultipartFormService } from '@modules/uploads/services/multipart-form.service';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { WellnessGoalEntity } from '../entities/wellness-goal.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { WellnessGoalUpdatedEvent, EVENTS } from '@packages/events';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

const WELLNESS_GOAL_MEDIA_FIELDS = ['image'] as const;

const WELLNESS_GOAL_UPLOAD_FIELDS = {
  image: UploadFolder.IMAGES,
} as const;

@Injectable()
export class WellnessGoalsService {
  constructor(
    private readonly wellnessGoalsRepository: WellnessGoalsRepository,
    private readonly multipartFormService: MultipartFormService,
    private readonly storageUrlEnricher: StorageUrlEnricher,
    private readonly deletionGuard: MasterDeletionGuardService,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createFromRequest(req: FastifyRequest, createdBy: string): Promise<IWellnessGoal> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      CreateWellnessGoalDto,
      WELLNESS_GOAL_UPLOAD_FIELDS,
    );

    return this.create(dto, uploadedUrls['image'] ?? null, createdBy);
  }

  async updateFromRequest(
    refId: string,
    req: FastifyRequest,
    updatedBy: string,
  ): Promise<IWellnessGoal> {
    const { dto, uploadedUrls } = await this.multipartFormService.parseAndValidate(
      req,
      UpdateWellnessGoalDto,
      WELLNESS_GOAL_UPLOAD_FIELDS,
    );

    return this.update(refId, dto, updatedBy, uploadedUrls['image']);
  }

  async create(
    dto: CreateWellnessGoalDto,
    image: string | null,
    createdBy: string,
  ): Promise<IWellnessGoal> {
    if (await this.wellnessGoalsRepository.existsByName(dto.name)) {
      throw new ConflictException(`A wellness goal with name "${dto.name}" already exists`);
    }

    const entity = await this.wellnessGoalsRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      image: this.storageUrlEnricher.persist(image),
      status: dto.status ?? MasterStatus.ACTIVE,
      inHomePage: dto.inHomePage ?? false,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.wellnessGoalsRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.invalidateHomePageCache();
    await this.emitWellnessGoalUpdated(entity.refId, 'created');
    return this.enrichWellnessGoal(mapWellnessGoalEntityToResponse(entity));
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<IWellnessGoal>> {
    const paginationOptions = buildPaginationOptions(query);
    const { data, total } =
      await this.wellnessGoalsRepository.findAllPaginated(paginationOptions);
    const result = buildPaginatedResult(
      mapWellnessGoalEntitiesToResponse(data),
      total,
      paginationOptions,
    );
    return this.storageUrlEnricher.enrichPaginated(result, [...WELLNESS_GOAL_MEDIA_FIELDS]);
  }

  async findOne(refId: string): Promise<IWellnessGoal> {
    const entity = await this.wellnessGoalsRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found`);
    }
    return this.enrichWellnessGoal(mapWellnessGoalEntityToResponse(entity));
  }

  async update(
    refId: string,
    dto: UpdateWellnessGoalDto,
    updatedBy: string,
    image?: string,
  ): Promise<IWellnessGoal> {
    const existing = await this.wellnessGoalsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found`);
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      if (await this.wellnessGoalsRepository.existsByName(dto.name, refId)) {
        throw new ConflictException(`A wellness goal with name "${dto.name}" already exists`);
      }
    }

    const payload: Partial<WellnessGoalEntity> = { updatedBy };
    if (dto.name !== undefined) payload.name = dto.name;
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.status !== undefined) payload.status = dto.status;
    if (dto.inHomePage !== undefined) payload.inHomePage = dto.inHomePage;
    if (image !== undefined) payload.image = this.storageUrlEnricher.persist(image);

    const updated = await this.wellnessGoalsRepository.updateByRefId(refId, payload);
    if (!updated) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found after update`);
    }

    await this.invalidateHomePageCache();
    await this.emitWellnessGoalUpdated(refId, 'updated');
    return this.enrichWellnessGoal(mapWellnessGoalEntityToResponse(updated));
  }

  async updateStatus(
    refId: string,
    dto: UpdateWellnessGoalStatusDto,
    updatedBy: string,
  ): Promise<IWellnessGoal> {
    const existing = await this.wellnessGoalsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found`);
    }

    const updated = await this.wellnessGoalsRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found after status update`);
    }

    await this.invalidateHomePageCache();
    await this.emitWellnessGoalUpdated(refId, 'status_updated');
    return this.enrichWellnessGoal(mapWellnessGoalEntityToResponse(updated));
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.wellnessGoalsRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Wellness goal with refId ${refId} not found`);
    }
    await this.deletionGuard.assertWellnessGoalDeletable(existing.id, existing.name);
    await this.wellnessGoalsRepository.softDeleteByRefId(refId);
    await this.invalidateHomePageCache();
    await this.emitWellnessGoalUpdated(refId, 'deleted');
  }

  private async emitWellnessGoalUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.WELLNESS_GOAL_UPDATED,
      new WellnessGoalUpdatedEvent(refId, action),
    );
  }

  private async invalidateHomePageCache(): Promise<void> {
    await this.cacheStrategy.invalidateOnly({
      patterns: [
        CacheKeys.homepage.shopByWellnessGoalsPattern(),
        CacheKeys.homepage.sectionsPattern(),
      ],
    });
  }

  private enrichWellnessGoal(wellnessGoal: IWellnessGoal): Promise<IWellnessGoal> {
    return this.storageUrlEnricher.enrichFields(wellnessGoal, [...WELLNESS_GOAL_MEDIA_FIELDS]);
  }
}
