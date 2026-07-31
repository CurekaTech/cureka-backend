import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HealthConcernEntity } from '../entities/health-concern.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { PaginationOptions, CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { buildSkipTake } from '@packages/database';

@Injectable()
export class HealthConcernsRepository {
  constructor(
    @InjectRepository(HealthConcernEntity)
    private readonly repo: Repository<HealthConcernEntity>,
  ) {}

  async create(data: Partial<HealthConcernEntity>): Promise<HealthConcernEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByRefId(refId: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findBySlug(slug: string): Promise<HealthConcernEntity | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  /** Active health concerns shown on the homepage, ordered by sortIndex ASC NULLS LAST, then name. */
  async findHomePageConcerns(limit: number): Promise<HealthConcernEntity[]> {
    return this.repo
      .createQueryBuilder('healthConcern')
      .where('healthConcern.inHomePage = :enabled', { enabled: true })
      .andWhere('healthConcern.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('healthConcern.sortIndex', 'ASC', 'NULLS LAST')
      .addOrderBy('healthConcern.name', 'ASC')
      .take(limit)
      .getMany();
  }

  async updateByRefId(
    refId: string,
    data: Partial<HealthConcernEntity>,
  ): Promise<HealthConcernEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async updateSortIndexByRefId(refId: string, sortIndex: number | null): Promise<HealthConcernEntity | null> {
    await this.repo.update({ refId }, { sortIndex });
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async update(id: string, data: Partial<HealthConcernEntity>): Promise<HealthConcernEntity | null> {
    await this.repo.update(id, data);
    return this.findById(id);
  }

  async softDelete(id: string): Promise<void> {
    await this.repo.softDelete(id);
  }

  async findAllPaginated(
    options: PaginationOptions,
  ): Promise<{ data: HealthConcernEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'healthConcern.createdAt',
      name: 'healthConcern.name',
      slug: 'healthConcern.slug',
      status: 'healthConcern.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'healthConcern.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('healthConcern')
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('(healthConcern.name ILIKE :search OR healthConcern.slug ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<HealthConcernEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'healthConcern',
      sortableColumns: {
        createdAt: 'healthConcern.createdAt',
        name: 'healthConcern.name',
        slug: 'healthConcern.slug',
        status: 'healthConcern.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression:
        '(healthConcern.name ILIKE :search OR healthConcern.slug ILIKE :search)',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<HealthConcernEntity[]> {
    const qb = this.repo
      .createQueryBuilder('healthConcern')
      .orderBy('healthConcern.name', 'ASC');
    if (status) {
      qb.where('healthConcern.status = :status', { status });
    }
    return qb.getMany();
  }

  async existsBySlug(slug: string): Promise<boolean> {
    return (await this.repo.count({ where: { slug } })) > 0;
  }

  async existsBySlugExcluding(slug: string, excludeId: string): Promise<boolean> {
    return (
      (await this.repo
        .createQueryBuilder('healthConcern')
        .where('healthConcern.slug = :slug', { slug })
        .andWhere('healthConcern.id != :excludeId', { excludeId })
        .getCount()) > 0
    );
  }

  async findAllActive(): Promise<HealthConcernEntity[]> {
    return this.repo.find({
      where: { status: MasterStatus.ACTIVE },
      order: { name: 'ASC' },
    });
  }

  /** Active health concerns for storefront "View all" (paginated). */
  async findPublicPaginated(
    options: PaginationOptions,
  ): Promise<{ data: HealthConcernEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'healthConcern.createdAt',
      name: 'healthConcern.name',
      slug: 'healthConcern.slug',
      sortIndex: 'healthConcern.sortIndex',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'healthConcern.name';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('healthConcern')
      .where('healthConcern.status = :status', { status: MasterStatus.ACTIVE })
      .skip(skip)
      .take(take);

    if (sortColumn === 'healthConcern.sortIndex') {
      qb.orderBy(sortColumn, sortOrder, 'NULLS LAST').addOrderBy('healthConcern.name', 'ASC');
    } else {
      qb.orderBy(sortColumn, sortOrder).addOrderBy('healthConcern.name', 'ASC');
    }

    if (options.search) {
      qb.andWhere(
        '(healthConcern.name ILIKE :search OR healthConcern.slug ILIKE :search OR healthConcern.refId ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveHomePageConcerns(): Promise<HealthConcernEntity[]> {
    return this.repo
      .createQueryBuilder('healthConcern')
      .where('healthConcern.inHomePage = :enabled', { enabled: true })
      .andWhere('healthConcern.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('healthConcern.sortIndex', 'ASC', 'NULLS LAST')
      .addOrderBy('healthConcern.name', 'ASC')
      .getMany();
  }

  /** All homepage health concerns (any status) for admin management, ordered by index. */
  async findAllHomePageConcernsForAdmin(): Promise<HealthConcernEntity[]> {
    return this.repo
      .createQueryBuilder('healthConcern')
      .where('healthConcern.inHomePage = :enabled', { enabled: true })
      .orderBy('healthConcern.sortIndex', 'ASC', 'NULLS LAST')
      .addOrderBy('healthConcern.name', 'ASC')
      .getMany();
  }
}
