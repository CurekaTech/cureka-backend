import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { SubscriptionMandateEntity } from '../entities/subscription-mandate.entity';
import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';

@Injectable()
export class SubscriptionMandatesRepository {
  constructor(
    @InjectRepository(SubscriptionMandateEntity)
    private readonly repo: Repository<SubscriptionMandateEntity>,
  ) {}

  private use(manager?: EntityManager) {
    return manager ? manager.getRepository(SubscriptionMandateEntity) : this.repo;
  }

  create(
    data: Partial<SubscriptionMandateEntity>,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity> {
    const repository = this.use(manager);
    return repository.save(repository.create(data));
  }

  findById(id: string, manager?: EntityManager): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({ where: { id } });
  }

  findLatestBySubscriptionId(
    subscriptionId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
  }

  findByGatewayMandateId(
    gatewayMandateId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({ where: { gatewayMandateId } });
  }

  findByGatewaySubscriptionId(
    gatewaySubscriptionId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({ where: { gatewaySubscriptionId } });
  }

  findByAuthorizationOrderId(
    authorizationOrderId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({ where: { authorizationOrderId } });
  }

  findLatestPendingByGatewayCustomerId(
    gatewayCustomerId: string,
    manager?: EntityManager,
  ): Promise<SubscriptionMandateEntity | null> {
    return this.use(manager).findOne({
      where: { gatewayCustomerId, status: SubscriptionMandateStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  async updateById(
    id: string,
    data: Partial<SubscriptionMandateEntity>,
    manager?: EntityManager,
  ): Promise<void> {
    await this.use(manager).update({ id }, data as never);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }
}
