import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackerEntity } from '../entities/packer.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { MasterListOptions, applyMasterListOrdering } from '../utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';

@Injectable()
export class PackersRepository {
  constructor(
    @InjectRepository(PackerEntity)
    private readonly repo: Repository<PackerEntity>,
  ) {}

  async create(data: Partial<PackerEntity>): Promise<PackerEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<PackerEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }
  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'packer', name, excludeRefId);
  }

  async existsByCode(code: string): Promise<boolean> {
    return (await this.repo.count({ where: { code } })) > 0;
  }

  async existsByCodeExcluding(code: string, excludeId: string): Promise<boolean> {
    const count = await this.repo
      .createQueryBuilder('packer')
      .where('packer.code = :code', { code })
      .andWhere('packer.id != :excludeId', { excludeId })
      .getCount();
    return count > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<PackerEntity>,
  ): Promise<PackerEntity | null> {
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
  ): Promise<{ data: PackerEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'packer.createdAt',
      name: 'packer.name',
      code: 'packer.code',
      status: 'packer.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'packer.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('packer')
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'packer', options.status, sortColumn, sortOrder);

    if (options.search) {
      qb.where(
        '(packer.name ILIKE :search OR packer.code ILIKE :search OR packer.gstNumber ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    if (options.status) {
      if (options.search) {
        qb.andWhere('packer.status = :status', { status: options.status });
      } else {
        qb.where('packer.status = :status', { status: options.status });
      }
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<PackerEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'packer',
      sortableColumns: {
        createdAt: 'packer.createdAt',
        name: 'packer.name',
        code: 'packer.code',
        status: 'packer.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: '(packer.name ILIKE :search OR packer.code ILIKE :search)',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<PackerEntity[]> {
    const qb = this.repo.createQueryBuilder('packer').orderBy('packer.name', 'ASC');
    if (status) {
      qb.where('packer.status = :status', { status });
    }
    return qb.getMany();
  }
}
