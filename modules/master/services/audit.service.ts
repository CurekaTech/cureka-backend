import { Injectable } from '@nestjs/common';
import { AuditLogEntity } from '../entities/audit-log.entity';
import {
  AuditLogsRepository,
  CreateAuditLogInput,
} from '../repositories/audit-logs.repository';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogsRepo: AuditLogsRepository) {}

  async log(input: CreateAuditLogInput): Promise<AuditLogEntity> {
    return this.auditLogsRepo.create(input);
  }

  async findByEntity(
    entityType: string,
    entityId: string,
    order: 'ASC' | 'DESC' = 'DESC',
  ): Promise<AuditLogEntity[]> {
    return this.auditLogsRepo.findByEntity(entityType, entityId, order);
  }
}
