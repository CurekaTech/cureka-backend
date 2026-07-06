import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WellnessGoalEntity } from '../entities/wellness-goal.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';

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

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
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

  /** Counts wellness goals flagged for the homepage (optionally excluding one). */
  async countInHomePage(excludeId?: string): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('wellnessGoal')
      .where('wellnessGoal.inHomePage = :enabled', { enabled: true });

    if (excludeId) {
      qb.andWhere('wellnessGoal.id != :excludeId', { excludeId });
    }

    return qb.getCount();
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

  async findAllPaginated(
    options: PaginationOptions,
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
      .orderBy(sortColumn, sortOrder)
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.where('wellnessGoal.name ILIKE :search', { search: `%${options.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
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
