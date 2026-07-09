import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationOptions } from '@packages/common';
import { buildSkipTake } from '@packages/database';
import { ReasonMasterEntity } from '../entities/reason-master.entity';
import { MasterStatus } from '../enums/master-status.enum';
import { ReasonPickupMode } from '../enums/reason-pickup-mode.enum';
import { ReasonWorkflow } from '../enums/reason-workflow.enum';

export interface ReasonMasterFindOptions extends PaginationOptions {
  status?: MasterStatus;
  workflow?: ReasonWorkflow;
  pickupMode?: ReasonPickupMode;
}

@Injectable()
export class ReasonMastersRepository {
  constructor(
    @InjectRepository(ReasonMasterEntity)
    private readonly repo: Repository<ReasonMasterEntity>,
  ) {}

  async create(data: Partial<ReasonMasterEntity>): Promise<ReasonMasterEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByRefId(refId: string): Promise<ReasonMasterEntity | null> {
    return this.repo.findOne({ where: { refId } });
  }

  async existsByRefId(refId: string): Promise<boolean> {
    return (await this.repo.count({ where: { refId } })) > 0;
  }

  async existsByCode(code: string, excludeRefId?: string): Promise<boolean> {
    const qb = this.repo
      .createQueryBuilder('reasonMaster')
      .where('LOWER(reasonMaster.code) = LOWER(:code)', { code });

    if (excludeRefId) {
      qb.andWhere('reasonMaster.refId != :excludeRefId', { excludeRefId });
    }

    return (await qb.getCount()) > 0;
  }

  async updateByRefId(
    refId: string,
    data: Partial<ReasonMasterEntity>,
  ): Promise<ReasonMasterEntity | null> {
    await this.repo.update({ refId }, data);
    return this.findByRefId(refId);
  }

  async softDeleteByRefId(refId: string): Promise<void> {
    await this.repo.softDelete({ refId });
  }

  async findAllPaginated(
    options: ReasonMasterFindOptions,
  ): Promise<{ data: ReasonMasterEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);

    const SORTABLE_COLUMNS: Record<string, string> = {
      createdAt: 'reasonMaster.createdAt',
      title: 'reasonMaster.title',
      code: 'reasonMaster.code',
      sortOrder: 'reasonMaster.sortOrder',
      status: 'reasonMaster.status',
    };
    const sortColumn =
      (options.sortBy && SORTABLE_COLUMNS[options.sortBy]) ?? 'reasonMaster.sortOrder';
    const sortOrder = options.sortOrder ?? 'ASC';

    const qb = this.repo
      .createQueryBuilder('reasonMaster')
      .orderBy(sortColumn, sortOrder)
      .addOrderBy('reasonMaster.title', 'ASC')
      .skip(skip)
      .take(take);

    if (options.search) {
      qb.andWhere(
        '(reasonMaster.title ILIKE :search OR reasonMaster.code ILIKE :search)',
        { search: `%${options.search}%` },
      );
    }

    if (options.status) {
      qb.andWhere('reasonMaster.status = :status', { status: options.status });
    }

    if (options.workflow) {
      qb.andWhere('reasonMaster.workflows @> :workflow::jsonb', {
        workflow: JSON.stringify([options.workflow]),
      });
    }

    if (options.pickupMode) {
      qb.andWhere('reasonMaster.pickupMode = :pickupMode', {
        pickupMode: options.pickupMode,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findActiveByWorkflow(workflow: ReasonWorkflow): Promise<ReasonMasterEntity[]> {
    return this.repo
      .createQueryBuilder('reasonMaster')
      .where('reasonMaster.status = :status', { status: MasterStatus.ACTIVE })
      .andWhere('reasonMaster.workflows @> :workflow::jsonb', {
        workflow: JSON.stringify([workflow]),
      })
      .orderBy('reasonMaster.sortOrder', 'ASC')
      .addOrderBy('reasonMaster.title', 'ASC')
      .getMany();
  }
}
