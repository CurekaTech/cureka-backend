import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MembershipBenefitEntity } from '../entities/membership-benefit.entity';

@Injectable()
export class MembershipBenefitsRepository {
  constructor(
    @InjectRepository(MembershipBenefitEntity)
    private readonly repo: Repository<MembershipBenefitEntity>,
  ) {}

  create(
    data: Partial<MembershipBenefitEntity>,
    manager?: EntityManager,
  ): Promise<MembershipBenefitEntity> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<MembershipBenefitEntity | null> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<MembershipBenefitEntity | null> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  findByPlanId(membershipPlanId: string, manager?: EntityManager): Promise<MembershipBenefitEntity[]> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    return repository.find({
      where: { membershipPlanId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async updateById(
    id: string,
    data: Partial<MembershipBenefitEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    await repository.update({ id }, data as any);
  }

  async softDeleteById(id: string, _deletedBy?: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(MembershipBenefitEntity) : this.repo;
    await repository.softDelete(id);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
