import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, QueryDeepPartialEntity, Repository } from 'typeorm';
import { ReturnPickupStatus } from '../enums/return-pickup-status.enum';
import { ReturnPickupEntity } from '../entities/return-pickup.entity';

@Injectable()
export class ReturnPickupsRepository {
  constructor(
    @InjectRepository(ReturnPickupEntity)
    private readonly repo: Repository<ReturnPickupEntity>,
  ) {}

  create(data: Partial<ReturnPickupEntity>, manager?: EntityManager): Promise<ReturnPickupEntity> {
    const repository = manager?.getRepository(ReturnPickupEntity) ?? this.repo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findActiveByReturnRequestId(
    returnRequestId: string,
    manager?: EntityManager,
  ): Promise<ReturnPickupEntity | null> {
    const repository = manager?.getRepository(ReturnPickupEntity) ?? this.repo;
    return repository.findOne({
      where: { returnRequestId, status: Not(ReturnPickupStatus.CANCELLED) },
      order: { createdAt: 'DESC' },
    });
  }

  findByReturnRequestId(returnRequestId: string): Promise<ReturnPickupEntity[]> {
    return this.repo.find({ where: { returnRequestId }, order: { createdAt: 'ASC' } });
  }

  findByReverseAwbNumber(reverseAwbNumber: string): Promise<ReturnPickupEntity | null> {
    return this.repo.findOne({ where: { reverseAwbNumber } });
  }

  findByProviderPickupId(providerPickupId: string): Promise<ReturnPickupEntity | null> {
    return this.repo.findOne({
      where: { providerPickupId },
      order: { createdAt: 'DESC' },
    });
  }

  async updateById(
    id: string,
    data: Partial<ReturnPickupEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(ReturnPickupEntity) ?? this.repo;
    await repository.update({ id }, data as QueryDeepPartialEntity<ReturnPickupEntity>);
  }
}
