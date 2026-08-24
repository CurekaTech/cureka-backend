import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '@modules/master/utils/master-cursor-query.util';
import { MasterListOptions } from '@modules/master/utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';
import { ProductInformationLabelEntity } from '../entities/product-information-label.entity';
import { MasterStatus } from '@modules/master/enums/master-status.enum';

@Injectable()
export class ProductInformationLabelsRepository {
  constructor(
    @InjectRepository(ProductInformationLabelEntity)
    private readonly repo: Repository<ProductInformationLabelEntity>,
  ) {}

  async create(data: Partial<ProductInformationLabelEntity>): Promise<ProductInformationLabelEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ProductInformationLabelEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('label')
      .where('label.name = :name', { name })
      .andWhere('label.deletedAt IS NULL');

    if (excludeRefId) {
      qb.andWhere('label.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ProductInformationLabelEntity>,
    manager?: import('typeorm').EntityManager,
  ): Promise<ProductInformationLabelEntity | null> {
    const repository = manager
      ? manager.getRepository(ProductInformationLabelEntity)
      : this.repo;
    await repository.update({ refId }, data);
    return repository.findOne({ where: { refId } });
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async getNextSortOrder(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder('label')
      .select('COALESCE(MAX(label.sortOrder), -1)', 'maxSortOrder')
      .where('label.deletedAt IS NULL')
      .getRawOne<{ maxSortOrder: string }>();

    return Number(result?.maxSortOrder ?? -1) + 1;
  }

  async findActiveSortOrdersByName(): Promise<Map<string, number>> {
    const labels = await this.repo
      .createQueryBuilder('label')
      .select(['label.name', 'label.sortOrder'])
      .where('label.deletedAt IS NULL')
      .andWhere('label.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('label.sortOrder', 'ASC')
      .addOrderBy('label.createdAt', 'ASC')
      .getMany();

    return new Map(labels.map((label) => [label.name, label.sortOrder]));
  }

  async updateSortOrders(
    items: Array<{ refId: string; sortOrder: number }>,
  ): Promise<ProductInformationLabelEntity[]> {
    const updated: ProductInformationLabelEntity[] = [];

    for (const item of items) {
      await this.repo.update({ refId: item.refId }, { sortOrder: item.sortOrder });
      const entity = await this.findByRefId(item.refId);
      if (entity) {
        updated.push(entity);
      }
    }

    return updated;
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: ProductInformationLabelEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'label.createdAt',
      name: 'label.name',
      status: 'label.status',
      sortOrder: 'label.sortOrder',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'label.sortOrder';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('label')
      .where('label.deletedAt IS NULL')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('label.createdAt', 'ASC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('label.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('label.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<ProductInformationLabelEntity>> {
    return executeMasterCursorQuery(
      this.repo,
      options,
      {
        alias: 'label',
        sortableColumns: {
          createdAt: 'label.createdAt',
          name: 'label.name',
          status: 'label.status',
          sortOrder: 'label.sortOrder',
        },
        defaultSortBy: 'sortOrder',
        defaultSortOrder: 'ASC',
        searchExpression: 'label.name ILIKE :search',
      },
      (qb) => {
        qb.andWhere('label.deletedAt IS NULL');
      },
    );
  }

  async findAllByStatus(status?: MasterStatus): Promise<ProductInformationLabelEntity[]> {
    const qb = this.repo
      .createQueryBuilder('label')
      .where('label.deletedAt IS NULL')
      .orderBy('label.sortOrder', 'ASC')
      .addOrderBy('label.createdAt', 'ASC');

    if (status) {
      qb.andWhere('label.status = :status', { status });
    }

    return qb.getMany();
  }

  transaction<T>(
    runInTransaction: (manager: import('typeorm').EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.repo.manager.transaction(runInTransaction);
  }
}
