import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionFrequencyEntity } from '../entities/subscription-frequency.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

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
    options: PaginationOptions,
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
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('subscriptionFrequency.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }
}
