import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
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
}
