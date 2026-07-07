import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  buildQueryCacheHash,
  CacheKeys,
  CacheModuleName,
  CacheStrategyService,
} from '@packages/cache';
import { EVENTS, SubscriptionFrequencyUpdatedEvent } from '@packages/events';
import { SubscriptionFrequenciesRepository } from '../repositories/subscription-frequencies.repository';
import {
  CreateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyDto,
  UpdateSubscriptionFrequencyStatusDto,
} from '../dto/subscription-frequency.dto';
import { ISubscriptionFrequency } from '../interfaces/subscription-frequency.interface';
import {
  mapSubscriptionFrequencyEntitiesToResponse,
  mapSubscriptionFrequencyEntityToResponse,
} from '../mappers/subscription-frequency.mapper';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  generateUniqueRefId,
  PaginatedResult,
  PaginationQueryDto,
} from '@packages/common';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class SubscriptionFrequenciesService {
  constructor(
    private readonly subscriptionFrequenciesRepository: SubscriptionFrequenciesRepository,
    private readonly cacheStrategy: CacheStrategyService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    dto: CreateSubscriptionFrequencyDto,
    createdBy: string,
  ): Promise<ISubscriptionFrequency> {
    if (await this.subscriptionFrequenciesRepository.existsByName(dto.name)) {
      throw new ConflictException(
        `A subscription frequency with name "${dto.name}" already exists`,
      );
    }

    const entity = await this.subscriptionFrequenciesRepository.create({
      name: dto.name,
      value: dto.value,
      unit: dto.unit,
      status: dto.status ?? MasterStatus.ACTIVE,
      refId: await generateUniqueRefId(dto.name, (refId) =>
        this.subscriptionFrequenciesRepository.existsByRefId(refId),
      ),
      createdBy,
    });

    await this.emitSubscriptionFrequencyUpdated(entity.refId, 'created');
    return mapSubscriptionFrequencyEntityToResponse(entity);
  }

  async findAll(query: PaginationQueryDto): Promise<PaginatedResult<ISubscriptionFrequency>> {
    const queryHash = buildQueryCacheHash({
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      search: query.search ?? '',
      sortBy: query.sortBy ?? '',
      sortOrder: query.sortOrder ?? '',
    });

    return this.cacheStrategy.cacheAside({
      key: CacheKeys.subscriptionFrequencies.list(queryHash),
      module: CacheModuleName.SUBSCRIPTION_FREQUENCY,
      loader: async () => {
        const paginationOptions = buildPaginationOptions(query);
        const { data, total } =
          await this.subscriptionFrequenciesRepository.findAllPaginated(paginationOptions);
        return buildPaginatedResult(
          mapSubscriptionFrequencyEntitiesToResponse(data),
          total,
          paginationOptions,
        );
      },
    });
  }

  async findOne(refId: string): Promise<ISubscriptionFrequency> {
    const entity = await this.subscriptionFrequenciesRepository.findByRefId(refId);
    if (!entity) {
      throw new NotFoundException(`Subscription frequency with refId ${refId} not found`);
    }
    return mapSubscriptionFrequencyEntityToResponse(entity);
  }

  async update(
    refId: string,
    dto: UpdateSubscriptionFrequencyDto,
    updatedBy: string,
  ): Promise<ISubscriptionFrequency> {
    const existing = await this.subscriptionFrequenciesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Subscription frequency with refId ${refId} not found`);
    }

    if (dto.name !== undefined && dto.name !== existing.name) {
      if (await this.subscriptionFrequenciesRepository.existsByName(dto.name, refId)) {
        throw new ConflictException(
          `A subscription frequency with name "${dto.name}" already exists`,
        );
      }
    }

    const updated = await this.subscriptionFrequenciesRepository.updateByRefId(refId, {
      ...dto,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Subscription frequency with refId ${refId} not found after update`,
      );
    }

    await this.emitSubscriptionFrequencyUpdated(refId, 'updated');
    return mapSubscriptionFrequencyEntityToResponse(updated);
  }

  async updateStatus(
    refId: string,
    dto: UpdateSubscriptionFrequencyStatusDto,
    updatedBy: string,
  ): Promise<ISubscriptionFrequency> {
    const existing = await this.subscriptionFrequenciesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Subscription frequency with refId ${refId} not found`);
    }

    const updated = await this.subscriptionFrequenciesRepository.updateByRefId(refId, {
      status: dto.status,
      updatedBy,
    });

    if (!updated) {
      throw new NotFoundException(
        `Subscription frequency with refId ${refId} not found after status update`,
      );
    }

    await this.emitSubscriptionFrequencyUpdated(refId, 'status_updated');
    return mapSubscriptionFrequencyEntityToResponse(updated);
  }

  async remove(refId: string): Promise<void> {
    const existing = await this.subscriptionFrequenciesRepository.findByRefId(refId);
    if (!existing) {
      throw new NotFoundException(`Subscription frequency with refId ${refId} not found`);
    }
    await this.subscriptionFrequenciesRepository.softDeleteByRefId(refId);
    await this.emitSubscriptionFrequencyUpdated(refId, 'deleted');
  }

  private async emitSubscriptionFrequencyUpdated(
    refId: string,
    action: 'created' | 'updated' | 'deleted' | 'status_updated',
  ): Promise<void> {
    await this.eventEmitter.emitAsync(
      EVENTS.SUBSCRIPTION_FREQUENCY_UPDATED,
      new SubscriptionFrequencyUpdatedEvent(refId, action),
    );
  }
}
