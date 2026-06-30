import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaymentRequestItemEntity } from '../entities/payment-request-item.entity';

@Injectable()
export class PaymentRequestItemsRepository {
  constructor(
    @InjectRepository(PaymentRequestItemEntity)
    private readonly repo: Repository<PaymentRequestItemEntity>,
  ) {}

  createMany(
    data: Partial<PaymentRequestItemEntity>[],
    manager?: EntityManager,
  ): Promise<PaymentRequestItemEntity[]> {
    const repository = manager ? manager.getRepository(PaymentRequestItemEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  async deleteByPaymentRequestId(paymentRequestId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(PaymentRequestItemEntity) : this.repo;
    await repository.delete({ paymentRequestId });
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
