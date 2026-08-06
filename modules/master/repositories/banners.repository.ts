import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BannerEntity } from '../entities/banner.entity';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { MasterStatus } from '../enums/master-status.enum';
import { BannerPlacement } from '../enums/banner-placement.enum';
import { BannerSlot } from '../enums/banner-slot.enum';

export interface BannerFindOptions extends PaginationOptions {
  placement?: BannerPlacement;
  slot?: BannerSlot;
  status?: MasterStatus;
}

@Injectable()
export class BannersRepository {
  constructor(
    @InjectRepository(BannerEntity)
    private readonly repo: Repository<BannerEntity>,
  ) {}

  async create(data: Partial<BannerEntity>): Promise<BannerEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<BannerEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<BannerEntity>,
  ): Promise<BannerEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: BannerFindOptions,
  ): Promise<{ data: BannerEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'banner.createdAt',
      title: 'banner.title',
      placement: 'banner.placement',
      sortOrder: 'banner.sortOrder',
      status: 'banner.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'banner.sortOrder';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('banner')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('banner.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.placement) {
      qb.andWhere('banner.placement = :placement', { placement: options.placement });
    }

    if (options.slot) {
      qb.andWhere('banner.slot = :slot', { slot: options.slot });
    }

    if (options.status) {
      qb.andWhere('banner.status = :status', { status: options.status });
    }

    if (options.search) {
      qb.andWhere('banner.title ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveForStorefront(now: Date = new Date()): Promise<BannerEntity[]> {
    return this.repo
      .createQueryBuilder('banner')
      .where('banner.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('(banner.starts_at IS NULL OR banner.starts_at <= :now)', { now })
      .andWhere('(banner.ends_at IS NULL OR banner.ends_at >= :now)', { now })
      .orderBy('banner.placement', 'ASC')
      .addOrderBy('banner.slot', 'ASC')
      .addOrderBy('banner.sort_order', 'ASC')
      .addOrderBy('banner.created_at', 'ASC')
      .getMany();
  }

  async findActiveByPlacement(
    placement: BannerPlacement,
    now: Date = new Date(),
  ): Promise<BannerEntity[]> {
    return this.repo
      .createQueryBuilder('banner')
      .where('banner.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('banner.placement = :placement', { placement })
      .andWhere('(banner.starts_at IS NULL OR banner.starts_at <= :now)', { now })
      .andWhere('(banner.ends_at IS NULL OR banner.ends_at >= :now)', { now })
      .orderBy('banner.sort_order', 'ASC')
      .addOrderBy('banner.created_at', 'ASC')
      .getMany();
  }

  async updateSortOrders(
    items: Array<{ refId: string; sortOrder: number }>,
  ): Promise<BannerEntity[]> {
    const updated: BannerEntity[] = [];

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
