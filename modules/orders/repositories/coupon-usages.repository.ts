import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { CouponUsageEntity } from '../entities/coupon-usage.entity';

@Injectable()
export class CouponUsagesRepository {
  constructor(
    @InjectRepository(CouponUsageEntity)
    private readonly repo: Repository<CouponUsageEntity>,
  ) {}

  countByCouponAndUser(
    couponId: string,
    userId: string,
    manager?: EntityManager,
  ): Promise<number> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (!isUuid) {
      return Promise.resolve(0);
    }
    const repository = manager ? manager.getRepository(CouponUsageEntity) : this.repo;
    return repository.count({ where: { couponId, userId } });
  }

  create(
    data: Pick<CouponUsageEntity, 'couponId' | 'userId' | 'orderId' | 'discountAmount'>,
    manager?: EntityManager,
  ): Promise<CouponUsageEntity> {
    const repository = manager ? manager.getRepository(CouponUsageEntity) : this.repo;
    return repository.save(repository.create(data));
  }
}
