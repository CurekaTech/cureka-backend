import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { AttributeUpdatedEvent, EVENTS } from '@packages/events';
import { AttributesRepository } from '../repositories/attributes.repository';
import { CreateAttributeDto, UpdateAttributeDto, UpdateAttributeStatusDto } from '../dto/attribute.dto';
import { IAttribute } from '../interfaces/attribute.interface';
import {
  mapAttributeEntityToResponse,
  mapAttributeEntitiesToResponse,
} from '../mappers/attribute.mapper';
import {
  buildPaginatedResult,
  generateUniqueRefId,
  PaginatedResult,
} from '@packages/common';
import { MasterListQueryDto } from '../dto/master-list-query.dto';
import { buildMasterListOptions } from '../utils/master-list-query.util';
import { MasterStatus } from '../enums/master-status.enum';
import { MasterDeletionGuardService } from './master-deletion-guard.service';

@Injectable()
export class AttributesService {
  constructor(
    private readonly attributesRepository: AttributesRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
    private readonly deletionGuard: MasterDeletionGuardService,
  ) {}

  async create(dto: CreateAttributeDto, createdBy: string): Promise<IAttribute> {
    const entity = await this.attributesRepository.create({
      name: dto.name,
      dataType: dto.dataType ?? null,
      values: dto.values ?? null,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.attributesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.emitAttributeUpdated(entity.refId, 'created');
    return mapAttributeEntityToResponse(entity);
  }

  async findAll(query: MasterListQueryDto): Promise<PaginatedResult<IAttribute>> {
    const queryHash = buildQueryCacheHash({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search ?? '',
      sortBy: query.sortBy ?? '',
      sortOrder: query.sortOrder ?? '',
      status: query.status ?? 'all',
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.attributes.list(queryHash),
      module: CacheModuleName.ATTRIBUTE,
      loader: async () => {
        const paginationOptions = buildMasterListOptions(query);
        const { data, total } =
          await this.attributesRepository.findAllPaginated(paginationOptions);
        return buildPaginatedResult(
          mapAttributeEntitiesToResponse(data),
          total,
          paginationOptions,
        );
      },
    });
  }

  async findOne(refId: string): Promise<IAttribute> {
    const entity = await this.attributesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }
    return mapAttributeEntityToResponse(entity);
  }

  async update(refId: string, dto: UpdateAttributeDto, updatedBy: string): Promise<IAttribute> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }

    const updated = await this.attributesRepository.updateByRefId(refId, {
      ...dto,
      dataType: dto.dataType !== undefined ? dto.dataType ?? null : undefined,
      values: dto.values !== undefined ? dto.values ?? null : undefined,
      updatedBy,
    });
    if (!updated) {
      throw new NotFoundException(`Attribute with refId ${refId} not found after update`);
    }

    await this.emitAttributeUpdated(refId, 'updated');
    return mapAttributeEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateAttributeStatusDto,
    updatedBy: string,
  ): Promise<IAttribute> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }

    const updated = await this.attributesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(`Attribute with refId ${refId} not found after status update`);
    }

    await this.emitAttributeUpdated(refId, 'status_updated');
    return mapAttributeEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.attributesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Attribute with refId ${refId} not found`);
    }
    await this.deletionGuard.assertAttributeDeletable(existing.id, existing.name);
    await this.attributesRepository.softDeleteByRefId(refId);
    await this.emitAttributeUpdated(refId, 'deleted');
  }

  private async emitAttributeUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.ATTRIBUTE_UPDATED,
      new AttributeUpdatedEvent(refId, action),
    );
  }
}
