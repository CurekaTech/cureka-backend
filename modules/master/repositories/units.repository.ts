import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { MasterListOptions, applyMasterListOrdering } from '../utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';
import { UnitEntity } from '../entities/unit.entity';
import { MasterStatus } from '../enums/master-status.enum';

@Injectable()
export class UnitsRepository {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly repo: Repository<UnitEntity>,
  ) {}

  async create(data: Partial<UnitEntity>): Promise<UnitEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<UnitEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'unit', name, excludeRefId);
  }

  async updateByRefId(
    refId: string,
    data: Partial<UnitEntity>,
  ): Promise<UnitEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: UnitEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'unit.createdAt',
      name: 'unit.name',
      status: 'unit.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'unit.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('unit')
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'unit', options.status, sortColumn, sortOrder);

    if (options.search) {
      qb.andWhere('unit.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('unit.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<UnitEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'unit',
      sortableColumns: {
        createdAt: 'unit.createdAt',
        name: 'unit.name',
        status: 'unit.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: 'unit.name ILIKE :search',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<UnitEntity[]> {
    const qb = this.repo.createQueryBuilder('unit').orderBy('unit.name', 'ASC');
    if (status) {
      qb.where('unit.status = :status', { status });
    }
    return qb.getMany();
  }
}
