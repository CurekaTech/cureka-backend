import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from '../entities/audit-log.entity';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Table and name expression are constants. Entity type is only queried when it is in this map. */
const LABEL_TABLES: Record<string, { table: string; expr: string }> = {
  product: { table: 'products', expr: 'name' },
  brand: { table: 'brands', expr: 'name' },
  category: { table: 'categories', expr: 'name' },
  coupon: { table: 'coupons', expr: 'title' },
  banner: { table: 'banners', expr: 'title' },
  user: { table: 'users', expr: "trim(concat_ws(' ', first_name, last_name))" },
  order: { table: 'orders', expr: 'order_number' },
};

function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_PATTERN.test(value);
}

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
    // Page views of this screen used to write a row per request and bury real events.
    // Hide those rows unless the caller asks for them by entity type.
    if (options.entityType) {
      qb.andWhere('audit.entityType = :entityType', { entityType: options.entityType });
    } else {
      qb.andWhere('audit.entityType <> :auditAccess', { auditAccess: 'audit_log_access' });
    }
    if (options.actorType) qb.andWhere('audit.actorType = :actorType', { actorType: options.actorType });
    if (options.actorId) qb.andWhere('audit.actorId = :actorId', { actorId: options.actorId });
    if (options.action) qb.andWhere('audit.action = :action', { action: options.action });
    if (options.from) qb.andWhere('audit.createdAt >= :from', { from: options.from });
    if (options.to) qb.andWhere('audit.createdAt <= :to', { to: options.to });
    qb.skip((options.page - 1) * options.limit).take(options.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  /**
   * Names for rows written before a subject snapshot existed.
   * Looks up the current catalogue/user/admin name. Does not write back to the audit row.
   */
  async loadDisplayLabels(
    rows: AuditLogEntity[],
  ): Promise<Map<string, { entityName: string | null; actorName: string | null }>> {
    const labels = new Map<string, { entityName: string | null; actorName: string | null }>();
    if (!rows.length) return labels;

    const entityIds = new Map<string, Set<string>>();
    const adminIds = new Set<string>();
    const userActorIds = new Set<string>();
    for (const row of rows) {
      const table = row.entityId && LABEL_TABLES[row.entityType];
      if (table && isUuid(row.entityId)) {
        const ids = entityIds.get(row.entityType) ?? new Set<string>();
        ids.add(row.entityId);
        entityIds.set(row.entityType, ids);
      }
      if (isUuid(row.actorId)) {
        if (row.actorType === 'ADMIN') adminIds.add(row.actorId);
        if (row.actorType === 'USER') userActorIds.add(row.actorId);
      }
    }

    const entityNames = new Map<string, string>();
    for (const [entityType, ids] of entityIds) {
      const spec = LABEL_TABLES[entityType];
      const found = (await this.repo.manager.query(
        `SELECT id::text AS id, ${spec.expr} AS name FROM ${spec.table} WHERE id = ANY($1::uuid[])`,
        [[...ids]],
      )) as Array<{ id: string; name: string | null }>;
      for (const item of found) {
        const name = item.name?.trim();
        if (name) entityNames.set(`${entityType}:${item.id}`, name);
      }
    }

    const actorNames = new Map<string, string>();
    if (adminIds.size) {
      const found = (await this.repo.manager.query(
        `SELECT id::text AS id, full_name AS name FROM admin_users WHERE id = ANY($1::uuid[])`,
        [[...adminIds]],
      )) as Array<{ id: string; name: string | null }>;
      for (const item of found) {
        const name = item.name?.trim();
        if (name) actorNames.set(item.id, name);
      }
    }
    if (userActorIds.size) {
      const found = (await this.repo.manager.query(
        `SELECT id::text AS id, trim(concat_ws(' ', first_name, last_name)) AS name FROM users WHERE id = ANY($1::uuid[])`,
        [[...userActorIds]],
      )) as Array<{ id: string; name: string | null }>;
      for (const item of found) {
        const name = item.name?.trim();
        if (name) actorNames.set(item.id, name);
      }
    }

    for (const row of rows) {
      labels.set(row.id, {
        entityName: row.entityId ? (entityNames.get(`${row.entityType}:${row.entityId}`) ?? null) : null,
        actorName: row.actorId ? (actorNames.get(row.actorId) ?? null) : null,
      });
    }
    return labels;
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
