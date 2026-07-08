import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupportTicketAuditLogEntity } from '../entities/support-ticket-audit-log.entity';
import { SupportAuditAction } from '../enums/support-audit-action.enum';

@Injectable()
export class SupportAuditLogsRepository {
  constructor(
    @InjectRepository(SupportTicketAuditLogEntity)
    private readonly repo: Repository<SupportTicketAuditLogEntity>,
  ) {}

  async create(data: {
    ticketId: string;
    action: SupportAuditAction;
    performedBy: string;
    details?: Record<string, unknown> | null;
  }): Promise<SupportTicketAuditLogEntity> {
    const entity = this.repo.create(data);
    return this.repo.save(entity);
  }

  async findByTicketId(ticketId: string): Promise<SupportTicketAuditLogEntity[]> {
    return this.repo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });
  }
}
