import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WellnessGoalEntity } from '../entities/wellness-goal.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { PaginationOptions, CursorPaginatedResult } from '@packages/common';
import {
  executeMasterCursorQuery,
  MasterCursorStatusOptions,
} from '../utils/master-cursor-query.util';
import { MasterListOptions, applyMasterListOrdering } from '../utils/master-list-query.util';
import { buildSkipTake } from '@packages/database';
import { existsActiveMasterByName } from '../utils/master-name-uniqueness.util';

@Injectable()
export class WellnessGoalsRepository {
  constructor(
    @InjectRepository(WellnessGoalEntity)
    private readonly repo: Repository<WellnessGoalEntity>,
  ) {}

  async create(data: Partial<WellnessGoalEntity>): Promise<WellnessGoalEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<WellnessGoalEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async findActiveByRefId(refId: string): Promise<WellnessGoalEntity | null> {
    return this.repo.findOne({ where: { refId, status: MasterStatus.ACTIVE } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByName(name: string, excludeRefId?: string): Promise<boolean> {
    return existsActiveMasterByName(this.repo, 'wellnessGoal', name, excludeRefId);
  }

  async updateByRefId(
    refId: string,
    data: Partial<WellnessGoalEntity>,
  ): Promise<WellnessGoalEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  /** Active wellness goals shown on the homepage (newest first), capped to `limit`. */
  async findHomePageGoals(limit: number): Promise<WellnessGoalEntity[]> {
    return this.repo
      .createQueryBuilder('wellnessGoal')
      .where('wellnessGoal.inHomePage = :enabled', { enabled: true })
      .andWhere('wellnessGoal.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy('wellnessGoal.createdAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /** Active wellness goals for storefront "View all" (paginated). */
  async findPublicPaginated(
    options: PaginationOptions,
  ): Promise<{ data: WellnessGoalEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'wellnessGoal.createdAt',
      name: 'wellnessGoal.name',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'wellnessGoal.name';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('wellnessGoal')
      .where('wellnessGoal.status = :status', { status: MasterStatus.ACTIVE })
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(wellnessGoal.name ILIKE :search OR wellnessGoal.refId ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findAllPaginated(
    options: MasterListOptions,
  ): Promise<{ data: WellnessGoalEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'wellnessGoal.createdAt',
      name: 'wellnessGoal.name',
      status: 'wellnessGoal.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'wellnessGoal.createdAt';
    const sortOrder = options.sortOrder ?? 'DESC';

    const qb = this.repo
      .createQueryBuilder('wellnessGoal')
      
      .skip(skip)
      .take(take);

    applyMasterListOrdering(qb, 'wellnessGoal', options.status, sortColumn, sortOrder);

    if (options.search) {
      qb.andWhere('wellnessGoal.name ILIKE :search', { search: `%${options.search}%` });
    }

    if (options.status) {
      qb.andWhere('wellnessGoal.status = :status', { status: options.status });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findCursorPaginated(
    options: MasterCursorStatusOptions,
  ): Promise<CursorPaginatedResult<WellnessGoalEntity>> {
    return executeMasterCursorQuery(this.repo, options, {
      alias: 'wellnessGoal',
      sortableColumns: {
        createdAt: 'wellnessGoal.createdAt',
        name: 'wellnessGoal.name',
        status: 'wellnessGoal.status',
      },
      defaultSortBy: 'name',
      defaultSortOrder: 'ASC',
      searchExpression: 'wellnessGoal.name ILIKE :search',
    });
  }

  async findAllByStatus(status?: MasterStatus): Promise<WellnessGoalEntity[]> {
    const qb = this.repo
      .createQueryBuilder('wellnessGoal')
      .orderBy('wellnessGoal.name', 'ASC');
    if (status) {
      qb.where('wellnessGoal.status = :status', { status });
    }
    return qb.getMany();
  }
}
