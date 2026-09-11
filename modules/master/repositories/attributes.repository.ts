import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AttributeEntity } from '../entities/attribute.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { MasterListOptions } from '../utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';

@Injectable()
export class AttributesRepository {
  constructor(
    @InjectRepository(AttributeEntity)
    private readonly repo: Repository<AttributeEntity>,
  ) {}

  async create(data: Partial<AttributeEntity>): Promise<AttributeEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AttributeEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRefId(refId: string): Promise<AttributeEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findByRefIds(refIds: string[]): Promise<AttributeEntity[]> {
    if (!refIds.length) return [];
    return this.repo.find({ where: { refId: In([...new Set(refIds)]) } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'attribute', name, excludeRefId);
  }

  async updateByRefId(refId: string, data: Partial<AttributeEntity>): Promise<AttributeEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<AttributeEntity>): Promise<AttributeEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: AttributeEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    // Allowlist prevents SQL injection from sortBy input
    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'attribute.createdAt',
      name: 'attribute.name',
      status: 'attribute.status',
    };
    const sortColumn = (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'attribute.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('attribute')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere('attribute.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('attribute.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<AttributeEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'attribute',
      sortableColumns: {
        createdAt: 'attribute.createdAt',
        name: 'attribute.name',
        status: 'attribute.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: 'attribute.name ILIKE :search',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<AttributeEntity[]> {
    const qb = this.repo.createQueryBuilder('attribute').orderBy('attribute.name', 'ASC');
    if (status) {
      qb.where('attribute.status = :status', { status });
    }
    return qb.getMany();
  }
}
