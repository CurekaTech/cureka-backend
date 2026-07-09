import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { WatchAndShopItemEntity } from '../entities/watch-and-shop-item.entity';

export interface WatchAndShopFindOptions extends PaginationOptions {
  status?: MasterStatus;
}

@Injectable()
export class WatchAndShopRepository {
  constructor(
    @InjectRepository(WatchAndShopItemEntity)
    private readonly repo: Repository<WatchAndShopItemEntity>,
  ) {}

  async create(data: Partial<WatchAndShopItemEntity>): Promise<WatchAndShopItemEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<WatchAndShopItemEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<WatchAndShopItemEntity>,
  ): Promise<WatchAndShopItemEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: WatchAndShopFindOptions,
  ): Promise<{ data: WatchAndShopItemEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'item.createdAt',
      title: 'item.title',
      sortOrder: 'item.sortOrder',
      status: 'item.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'item.sortOrder';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('item')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('item.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('item.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere(
        '(item.title ILIKE :search OR item.product_ref_id ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveForStorefront(now: Date = new Date()): Promise<WatchAndShopItemEntity[]> {
    return this.repo
      .createQueryBuilder('item')
      .where('item.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('(item.starts_at IS NULL OR item.starts_at <= :now)', { now })
      .andWhere('(item.ends_at IS NULL OR item.ends_at >= :now)', { now })
      .orderBy('item.sort_order', 'ASC')
      .addOrderBy('item.created_at', 'ASC')
      .getMany();
  }

  async updateSortOrders(
    items: Array<{ refId: string; sortOrder: number }>,
  ): Promise<WatchAndShopItemEntity[]> {
    const updated: WatchAndShopItemEntity[] = [];

    for (const item of items) {
      await this.repo.update({ refId: item.refId }, { sortOrder: item.sortOrder });
      const entity = await this.findByRefId(item.refId);
      if (entity) {
        updated.push(entity);
      }
    }

    return updated;
  }
}
