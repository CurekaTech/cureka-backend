import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Repository } from 'typeorm';
import { MembershipPlanEntity } from '../entities/membership-plan.entity';
import { MembershipPlanStatus } from '../enums/membership-plan-status.enum';

@Injectable()
export class MembershipPlansRepository {
  constructor(
    @InjectRepository(MembershipPlanEntity)
    private readonly repo: Repository<MembershipPlanEntity>,
  ) {}

  create(data: Partial<MembershipPlanEntity>, manager?: EntityManager): Promise<MembershipPlanEntity> {
    const repository = manager ? manager.getRepository(MembershipPlanEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<MembershipPlanEntity | null> {
    const repository = manager ? manager.getRepository(MembershipPlanEntity) : this.repo;
    return repository.findOne({
      where: { id },
      relations: { benefits: true },
      order: { benefits: { sortOrder: 'ASC' } },
    });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<MembershipPlanEntity | null> {
    const repository = manager ? manager.getRepository(MembershipPlanEntity) : this.repo;
    return repository.findOne({
      where: { refId },
      relations: { benefits: true },
      order: { benefits: { sortOrder: 'ASC' } },
    });
  }

  findActivePlans(): Promise<MembershipPlanEntity[]> {
    return this.repo.find({
      where: { status: MembershipPlanStatus.ACTIVE },
      relations: { benefits: true },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: MembershipPlanStatus;
  }): Promise<{ data: MembershipPlanEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('plan')
      .leftJoinAndSelect('plan.benefits', 'benefits')
      .orderBy('plan.sortOrder', 'ASC')
      .addOrderBy('plan.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('plan.status = :status', { status: options.status });
    }
    if (options.search) {
      qb.andWhere('(plan.name ILIKE :search OR plan.refId ILIKE :search)', {
        search: `%${options.search}%`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateById(
    id: string,
    data: Partial<MembershipPlanEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(MembershipPlanEntity) : this.repo;
    await repository.update({ id }, data as any);
  }

  async softDeleteById(id: string, _deletedBy?: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(MembershipPlanEntity) : this.repo;
    await repository.softDelete(id);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
