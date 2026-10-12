import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';

export type CreateAuditLogInput = {
  entityType: string;
  entityId?: string | null;
  entityRefId?: string | null;
  action: string;
  performedBy: string;
  details?: Record<string, unknown> | null;
  actorType?: string | null;
  actorId?: string | null;
  ipAddress?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  reliability?: string | null;
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
      entityId: data.entityId ?? null,
      entityRefId: data.entityRefId ?? null,
      action: data.action,
      performedBy: data.performedBy,
      details: data.details ?? null,
      actorType: data.actorType ?? null,
      actorId: data.actorId ?? null,
      ipAddress: data.ipAddress ?? null,
      requestId: data.requestId ?? null,
      idempotencyKey: data.idempotencyKey ?? null,
      reliability: data.reliability ?? null,
    });
    return this.repo.save(entity);
  }

  async findById(id: string): Promise<AuditLogEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findPage(options: {
    page: number;
    limit: number;
    entityType?: string;
    actorType?: string;
    actorId?: string;
    action?: string;
    from?: Date;
    to?: Date;
  }): Promise<{ data: AuditLogEntity[]; total: number }> {
    const qb = this.repo.createQueryBuilder('audit').orderBy('audit.createdAt', 'DESC');
    if (options.entityType) qb.andWhere('audit.entityType = :entityType', { entityType: options.entityType });
    if (options.actorType) qb.andWhere('audit.actorType = :actorType', { actorType: options.actorType });
    if (options.actorId) qb.andWhere('audit.actorId = :actorId', { actorId: options.actorId });
    if (options.action) qb.andWhere('audit.action = :action', { action: options.action });
    if (options.from) qb.andWhere('audit.createdAt >= :from', { from: options.from });
    if (options.to) qb.andWhere('audit.createdAt <= :to', { to: options.to });
    qb.skip((options.page - 1) * options.limit).take(options.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
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
