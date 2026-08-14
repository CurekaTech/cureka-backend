import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Not, Repository } from 'typeorm';
import { MembershipPaymentEntity } from '../entities/membership-payment.entity';
import { MembershipPaymentStatus } from '../enums/membership-payment-status.enum';

@Injectable()
export class MembershipPaymentsRepository {
  constructor(
    @InjectRepository(MembershipPaymentEntity)
    private readonly repo: Repository<MembershipPaymentEntity>,
  ) {}

  create(
    data: Partial<MembershipPaymentEntity>,
    manager?: EntityManager,
  ): Promise<MembershipPaymentEntity> {
    const repository = manager ? manager.getRepository(MembershipPaymentEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<MembershipPaymentEntity | null> {
    const repository = manager ? manager.getRepository(MembershipPaymentEntity) : this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefId(refId: string, manager?: EntityManager): Promise<MembershipPaymentEntity | null> {
    const repository = manager ? manager.getRepository(MembershipPaymentEntity) : this.repo;
    return repository.findOne({ where: { refId } });
  }

  findByBillingCycle(
    userMembershipId: string,
    billingCycleRef: string,
    manager?: EntityManager,
  ): Promise<MembershipPaymentEntity | null> {
    const repository = manager ? manager.getRepository(MembershipPaymentEntity) : this.repo;
    return repository.findOne({ where: { userMembershipId, billingCycleRef } });
  }

  findByGatewayOrderId(gatewayOrderId: string): Promise<MembershipPaymentEntity | null> {
    return this.repo.findOne({ where: { gatewayOrderId } });
  }

  findByUserMembershipId(userMembershipId: string): Promise<MembershipPaymentEntity[]> {
    return this.repo.find({
      where: { userMembershipId },
      order: { billingDate: 'DESC' },
    });
  }

  findByUserId(userId: string): Promise<MembershipPaymentEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findPaginated(options: {
    page: number;
    limit: number;
    search?: string;
    status?: MembershipPaymentStatus;
    userId?: string;
    userMembershipId?: string;
  }): Promise<{ data: MembershipPaymentEntity[]; total: number }> {
    const { skip, take } = buildSkipTake(options.page, options.limit);
    const qb = this.repo
      .createQueryBuilder('payment')
      .orderBy('payment.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (options.status) {
      qb.andWhere('payment.status = :status', { status: options.status });
    }
    if (options.userId) {
      qb.andWhere('payment.userId = :userId', { userId: options.userId });
    }
    if (options.userMembershipId) {
      qb.andWhere('payment.userMembershipId = :userMembershipId', {
        userMembershipId: options.userMembershipId,
      });
    }
    if (options.search) {
      qb.andWhere(
        `(payment.refId ILIKE :search OR payment.billingCycleRef ILIKE :search OR payment.gatewayOrderId ILIKE :search)`,
        { search: `%${options.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async updateById(
    id: string,
    data: Partial<MembershipPaymentEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(MembershipPaymentEntity) : this.repo;
    await repository.update({ id }, data as any);
  }

  async markPaidIfUnpaid(
    id: string,
    data: Partial<MembershipPaymentEntity>,
  ): Promise<boolean> {
    const result = await this.repo.update(
      { id, status: Not(MembershipPaymentStatus.PAID) },
      data as any,
    );
    return (result.affected ?? 0) > 0;
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
