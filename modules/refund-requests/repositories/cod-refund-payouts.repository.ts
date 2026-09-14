import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryDeepPartialEntity, Repository } from 'typeorm';
import { CodPayoutStatus } from '../enums/cod-payout-status.enum';
import { CodRefundPayoutEntity } from '../entities/cod-refund-payout.entity';

@Injectable()
export class CodRefundPayoutsRepository {
  constructor(
    @InjectRepository(CodRefundPayoutEntity)
    private readonly repo: Repository<CodRefundPayoutEntity>,
  ) {}

  create(
    data: Partial<CodRefundPayoutEntity>,
    manager?: EntityManager,
  ): Promise<CodRefundPayoutEntity> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<CodRefundPayoutEntity | null> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    return repository.findOne({ where: { id } });
  }

  findByRefundRequestId(
    refundRequestId: string,
    manager?: EntityManager,
  ): Promise<CodRefundPayoutEntity | null> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    return repository.findOne({ where: { refundRequestId } });
  }

  findByReturnRequestId(
    returnRequestId: string,
    manager?: EntityManager,
  ): Promise<CodRefundPayoutEntity | null> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    return repository.findOne({ where: { returnRequestId } });
  }

  async lockById(id: string, manager: EntityManager): Promise<CodRefundPayoutEntity | null> {
    return manager
      .getRepository(CodRefundPayoutEntity)
      .createQueryBuilder('payout')
      .setLock('pessimistic_write')
      .where('payout.id = :id', { id })
      .getOne();
  }

  async updateById(
    id: string,
    data: Partial<CodRefundPayoutEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    await repository.update({ id }, data as QueryDeepPartialEntity<CodRefundPayoutEntity>);
  }

  async sumPaidAmountsForOrder(orderId: string, manager?: EntityManager): Promise<number> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    const raw = await repository
      .createQueryBuilder('payout')
      .select(`COALESCE(SUM(CAST(payout.amount AS numeric)), 0)`, 'total')
      .where('payout.orderId = :orderId', { orderId })
      .andWhere('payout.status = :status', { status: CodPayoutStatus.PAID })
      .getRawOne<{ total: string }>();
    return Number(raw?.total ?? 0);
  }

  async existsByRefundRequestId(refundRequestId: string, manager?: EntityManager): Promise<boolean> {
    const repository = manager?.getRepository(CodRefundPayoutEntity) ?? this.repo;
    return repository.exists({ where: { refundRequestId } });
  }
}
