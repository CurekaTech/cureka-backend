import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionFrequencyEntity } from '../entities/subscription-frequency.entity';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';
import { MasterListOptions, applyMasterListOrdering } from '../utils/master-list-query.util';

@Injectable()
export class SubscriptionFrequenciesRepository {
  constructor(
    @InjectRepository(SubscriptionFrequencyEntity)
    private readonly repo: Repository<SubscriptionFrequencyEntity>,
  ) {}

  async create(data: Partial<SubscriptionFrequencyEntity>): Promise<SubscriptionFrequencyEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<SubscriptionFrequencyEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'subscriptionFrequency', name, excludeRefId);
  }

  async updateByRefId(
    refId: string,
    data: Partial<SubscriptionFrequencyEntity>,
  ): Promise<SubscriptionFrequencyEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: SubscriptionFrequencyEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'subscriptionFrequency.createdAt',
      name: 'subscriptionFrequency.name',
      value: 'subscriptionFrequency.value',
      unit: 'subscriptionFrequency.unit',
      status: 'subscriptionFrequency.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ??
      'subscriptionFrequency.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('subscriptionFrequency')
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'subscriptionFrequency', options.status, sortColumn, sortOrder);

    if (options.search) {
      qb.andWhere('subscriptionFrequency.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('subscriptionFrequency.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
