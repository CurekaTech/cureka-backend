import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImporterEntity } from '../entities/importer.entity';
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
export class ImportersRepository {
  constructor(
    @InjectRepository(ImporterEntity)
    private readonly repo: Repository<ImporterEntity>,
  ) {}

  async create(data: Partial<ImporterEntity>): Promise<ImporterEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ImporterEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'importer', name, excludeRefId);
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.repo.count({ where: { code } })) > 0;
  }

  async existsByCodeExcluding(code: string, excludeId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('importer')
      .where('importer.code = :code', { code })
      .andWhere('importer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ImporterEntity>,
  ): Promise<ImporterEntity | null> {
    const entity = await this.findByRefId(refId);
    if (!entity) return null;
    Object.assign(entity, data);
    await this.repo.save(entity);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: ImporterEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'importer.createdAt',
      name: 'importer.name',
      code: 'importer.code',
      iec: 'importer.iec',
      status: 'importer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'importer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('importer')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where(
        '(importer.name ILIKE :search OR importer.code ILIKE :search OR importer.iec ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    if (options.status) {
      if (options.search) {
        qb.andWhere('importer.status = :status', { status: options.status });
      } else {
        qb.where('importer.status = :status', { status: options.status });
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<ImporterEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'importer',
      sortableColumns: {
        createdAt: 'importer.createdAt',
        name: 'importer.name',
        code: 'importer.code',
        iec: 'importer.iec',
        status: 'importer.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression:
        '(importer.name ILIKE :search OR importer.code ILIKE :search OR importer.iec ILIKE :search)',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<ImporterEntity[]> {
    const qb = this.repo.createQueryBuilder('importer').orderBy('importer.name', 'ASC');
    if (status) {
      qb.where('importer.status = :status', { status });
    }
    return qb.getMany();
  }
}
