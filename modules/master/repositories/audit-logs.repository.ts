import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';

export type CreateAuditLogInput = {
  entityType: string;
  entityId: string;
  entityRefId?: string | null;
  action: string;
  performedBy: string;
  details?: Record<string, unknown> | null;
};

@Injectable()
export class AuditLogsRepository {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly repo: Repository<AuditLogEntity>,
  ) {}

  async create(data: CreateAuditLogInput): Promise<AuditLogEntity> {
    const entity = this.repo.create({
      entityType: data.entityType,
      entityId: data.entityId,
      entityRefId: data.entityRefId ?? null,
      action: data.action,
      performedBy: data.performedBy,
      details: data.details ?? null,
    });
    return this.repo.save(entity);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<AuditLogEntity[]> {
    return this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: order },
    });
  }
}
