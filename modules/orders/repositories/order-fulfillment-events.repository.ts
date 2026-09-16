import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { generateUniqueRefId } from '@packages/common';
import { EntityManager, Repository } from 'typeorm';
import { OrderFulfillmentEventEntity } from '../entities/order-fulfillment-event.entity';
import {
  OrderFulfillmentEventType,
  OrderFulfillmentRequestType,
} from '../enums/order-fulfillment-event-type.enum';

export type CreateFulfillmentEventInput = {
  orderId: string;
  requestType: OrderFulfillmentRequestType;
  eventType: OrderFulfillmentEventType;
  actorId: string;
  actorType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  isCustomerVisible?: boolean;
};

@Injectable()
export class OrderFulfillmentEventsRepository {
  constructor(
    @InjectRepository(OrderFulfillmentEventEntity)
    private readonly repo: Repository<OrderFulfillmentEventEntity>,
  ) {}

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  async create(
    data: CreateFulfillmentEventInput,
    manager?: EntityManager,
  ): Promise<OrderFulfillmentEventEntity> {
    const repository = manager
      ? manager.getRepository(OrderFulfillmentEventEntity)
      : this.repo;
    const refId = await generateUniqueRefId('ofe', (candidate) =>
      repository.exists({ where: { refId: candidate } }),
    );
    return repository.save(
      repository.create({
        ...data,
        refId,
        fromStatus: data.fromStatus ?? null,
        toStatus: data.toStatus ?? null,
        message: data.message ?? null,
        metadata: data.metadata ?? null,
        isCustomerVisible: data.isCustomerVisible ?? false,
        createdBy: data.actorId,
        updatedBy: data.actorId,
      }),
    );
  }

  findByOrderId(orderId: string): Promise<OrderFulfillmentEventEntity[]> {
    return this.repo.find({
      where: { orderId },
      order: { createdAt: 'ASC' },
    });
  }
}
