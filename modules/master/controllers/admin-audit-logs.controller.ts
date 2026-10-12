import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';
import { AuditService } from '../services/audit.service';
import { getAuditActor } from '../utils/audit-actor.context';
import { redactAuditDetails } from '../utils/audit-redact.util';
import { auditIdempotency } from '../utils/audit-idempotency.util';
import { AuditLogEntity } from '../entities/audit-log.entity';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly auditService: AuditService,
  ) {}

  @ResponseMessage('Audit logs retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('audit_logs.read')
  @Get()
  async findAll(@Query() query: AuditLogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { data, total } = await this.auditLogsRepository.findPage({
      page,
      limit,
      entityType: query.entityType,
      actorType: query.actorType,
      actorId: query.actorId,
      action: query.action,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    await this.recordAccess('list', null);
    return buildPaginatedResult(
      data.map(toAuditView),
      total,
      buildPaginationOptions({ page, limit, sortOrder: 'DESC' }),
    );
  }

  @ResponseMessage('Audit log retrieved successfully')
  @Roles(AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN)
  @RequirePermissions('audit_logs.read')
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.auditLogsRepository.findById(id);
    if (!row) throw new NotFoundException(`Audit log ${id} not found`);
    await this.recordAccess('detail', id);
    return toAuditView(row);
  }

  private async recordAccess(action: 'list' | 'detail', auditLogId: string | null): Promise<void> {
    const actor = getAuditActor();
    if (!actor || actor.type !== 'ADMIN' || !actor.id) return;
    await this.auditService.log({
      entityType: 'audit_log_access',
      entityId: null,
      entityRefId: auditLogId,
      action,
      performedBy: actor.performedBy,
      actorType: 'ADMIN',
      actorId: actor.id,
      idempotencyKey: auditIdempotency.write(
        'audit_log_access',
        actor.id,
        action,
        actor.requestId ?? `${Date.now()}`,
      ),
      details: { auditLogId },
    });
  }
}

function toAuditView(row: AuditLogEntity) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityRefId: row.entityRefId,
    action: row.action,
    performedBy: row.performedBy,
    actorType: row.actorType,
    actorId: row.actorId,
    ipAddress: row.ipAddress,
    requestId: row.requestId,
    reliability: row.reliability,
    details: redactAuditDetails(row.details),
    createdAt: row.createdAt,
  };
}
