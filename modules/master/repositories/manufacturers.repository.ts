import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ManufacturerEntity } from '../entities/manufacturer.entity';
import { CategoryEntity } from '../entities/category.entity';
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
export class ManufacturersRepository {
  constructor(
    @InjectRepository(ManufacturerEntity)
    private readonly repo: Repository<ManufacturerEntity>,
  ) {}

  async create(
    data: Partial<ManufacturerEntity>,
    categories: CategoryEntity[],
  ): Promise<ManufacturerEntity> {
    const entity = this.repo.create({ ...data, categories });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<ManufacturerEntity | null> {
    return this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .where('manufacturer.id = :id', { id })
      .getOne();
  }

  async findByRefId(refId: string): Promise<ManufacturerEntity | null> {
    return this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .where('manufacturer.refId = :refId', { refId })
      .getOne();
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.repo.count({ where: { code } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'manufacturer', name, excludeRefId);
  }

  async existsByCodeExcluding(code: string, excludeId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('manufacturer')
      .where('manufacturer.code = :code', { code })
      .andWhere('manufacturer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ManufacturerEntity>,
    categories?: CategoryEntity[],
  ): Promise<ManufacturerEntity | null> {
    const entity = await this.findByRefId(refId);
    if (!entity) return null;
    Object.assign(entity, data);
    if (categories !== undefined) {
      entity.categories = categories;
    }
    await this.repo.save(entity);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: ManufacturerEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'manufacturer.createdAt',
      name: 'manufacturer.name',
      code: 'manufacturer.code',
      status: 'manufacturer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'manufacturer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('manufacturer')
      .leftJoinAndSelect('manufacturer.categories', 'category')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('(manufacturer.name ILIKE :search OR manufacturer.code ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    if (options.status) {
      if (options.search) {
        qb.andWhere('manufacturer.status = :status', { status: options.status });
      } else {
        qb.where('manufacturer.status = :status', { status: options.status });
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<ManufacturerEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'manufacturer',
      sortableColumns: {
        createdAt: 'manufacturer.createdAt',
        name: 'manufacturer.name',
        code: 'manufacturer.code',
        status: 'manufacturer.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: '(manufacturer.name ILIKE :search OR manufacturer.code ILIKE :search)',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<ManufacturerEntity[]> {
    const qb = this.repo
      .createQueryBuilder('manufacturer')
      .orderBy('manufacturer.name', 'ASC');
    if (status) {
      qb.where('manufacturer.status = :status', { status });
    }
    return qb.getMany();
  }
}
