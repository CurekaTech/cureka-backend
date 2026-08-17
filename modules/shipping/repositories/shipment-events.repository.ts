import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ShipmentEventEntity } from '../entities/shipment-event.entity';

@Injectable()
export class ShipmentEventsRepository {
  constructor(
    @InjectRepository(ShipmentEventEntity)
    private readonly repo: Repository<ShipmentEventEntity>,
  ) {}

  create(data: Partial<ShipmentEventEntity>, manager?: EntityManager): Promise<ShipmentEventEntity> {
    const repository = manager ? manager.getRepository(ShipmentEventEntity) : this.repo;
    return repository.save(repository.create(data));
  }

  existsByRefId(refId: string): Promise<boolean> {
    return this.repo.exists({ where: { refId } });
  }

<<<<<<< HEAD
  findByShipmentId(
    shipmentId: string,
    manager?: EntityManager,
  ): Promise<ShipmentEventEntity[]> {
    const repository = manager ? manager.getRepository(ShipmentEventEntity) : this.repo;
    return repository.find({ where: { shipmentId } });
=======
  existsDuplicateEvent(
    shipmentId: string,
    status: string,
    happenedAt: Date | null,
    description: string | null,
  ): Promise<boolean> {
    return this.repo.exists({
      where: {
        shipmentId,
        status,
        happenedAt: happenedAt === null ? IsNull() : happenedAt,
        description: description === null ? IsNull() : description,
        source: 'webhook',
      },
    });
  }

  async findLatestHappenedAt(shipmentId: string): Promise<Date | null> {
    const row = await this.repo
      .createQueryBuilder('event')
      .select('MAX(event.happened_at)', 'max')
      .where('event.shipment_id = :shipmentId', { shipmentId })
      .andWhere('event.happened_at IS NOT NULL')
      .getRawOne<{ max: Date | string | null }>();

    if (!row?.max) return null;
    return row.max instanceof Date ? row.max : new Date(row.max);
>>>>>>> 4e4e311 (Update Shipway configuration and validation)
  }
}
