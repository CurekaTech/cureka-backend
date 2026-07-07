import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { buildSkipTake } from '@packages/database';
import { EntityManager, Repository } from 'typeorm';
import { ShipmentEntity } from '../entities/shipment.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';

@Injectable()
export class ShipmentsRepository {
  constructor(
    @InjectRepository(ShipmentEntity)
    private readonly repo: Repository<ShipmentEntity>,
  ) {}

  create(data: Partial<ShipmentEntity>, manager?: EntityManager): Promise<ShipmentEntity> {
    const repository = manager ? manager.getRepository(ShipmentEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  save(entity: ShipmentEntity, manager?: EntityManager): Promise<ShipmentEntity> {
    const repository = manager ? manager.getRepository(ShipmentEntity) : this.repo;
    return repository.save(entity);
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

  findByOrderId(orderId: string, manager?: EntityManager): Promise<ShipmentEntity | null> {
    const repository = manager ? manager.getRepository(ShipmentEntity) : this.repo;
    return repository.findOne({ where: { orderId }, relations: { events: true } });
  }

  findByShipwayOrderId(shipwayOrderId: string, manager?: EntityManager): Promise<ShipmentEntity | null> {
    const repository = manager ? manager.getRepository(ShipmentEntity) : this.repo;
    return repository.findOne({ where: { shipwayOrderId }, relations: { events: true } });
  }

  async updateStatus(
    id: string,
    data: {
      shipmentStatus: ShipmentStatus;
      shipwayRawStatus: string | null;
      lastSyncedAt?: Date;
      lastWebhookEventId?: string | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager ? manager.getRepository(ShipmentEntity) : this.repo;
    await repository.update({ id }, data);
  }

  async findPaginated(options: { page: number; limit: number; status?: ShipmentStatus }) {
    const { page, limit, status } = options;
    const { skip, take } = buildSkipTake(page, limit);
    const [data, total] = await this.repo.findAndCount({
      where: status ? { shipmentStatus: status } : {},
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return { data, total };
  }
}
