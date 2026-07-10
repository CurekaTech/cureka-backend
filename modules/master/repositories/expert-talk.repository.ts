import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { ExpertTalkContentType } from '../enums/expert-talk-content-type.enum';
import { MasterStatus } from '../enums/master-status.enum';
import { ExpertTalkItemEntity } from '../entities/expert-talk-item.entity';

export interface ExpertTalkFindOptions extends PaginationOptions {
  status?: MasterStatus;
  contentType?: ExpertTalkContentType;
  requireVideoUrl?: boolean;
}

@Injectable()
export class ExpertTalkRepository {
  constructor(
    @InjectRepository(ExpertTalkItemEntity)
    private readonly repo: Repository<ExpertTalkItemEntity>,
  ) {}

  async create(data: Partial<ExpertTalkItemEntity>): Promise<ExpertTalkItemEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ExpertTalkItemEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ExpertTalkItemEntity>,
  ): Promise<ExpertTalkItemEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: ExpertTalkFindOptions,
  ): Promise<{ data: ExpertTalkItemEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'item.createdAt',
      title: 'item.title',
      sortOrder: 'item.sortOrder',
      status: 'item.status',
      contentType: 'item.contentType',
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

    if (options.contentType) {
      qb.andWhere('item.content_type = :contentType', {
        contentType: options.contentType,
      });
    }

    if (options.requireVideoUrl) {
      qb.andWhere("item.video_url IS NOT NULL AND TRIM(item.video_url) <> ''");
    }

    if (options.search) {
      qb.andWhere('(item.title ILIKE :search OR item.description ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveForStorefront(limit?: number): Promise<ExpertTalkItemEntity[]> {
    const qb = this.repo
      .createQueryBuilder('item')
      .where('item.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere("item.video_url IS NOT NULL AND TRIM(item.video_url) <> ''")
      .orderBy('item.sort_order', 'ASC')
      .addOrderBy('item.created_at', 'ASC');

    if (limit != null) {
      qb.take(limit);
    }

    return qb.getMany();
  }

  async updateSortOrders(
    items: Array<{ refId: string; sortOrder: number }>,
  ): Promise<ExpertTalkItemEntity[]> {
    const updated: ExpertTalkItemEntity[] = [];

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
