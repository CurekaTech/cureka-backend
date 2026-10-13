import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';
import { redactAuditDetails } from '../utils/audit-redact.util';
import { AuditLogEntity } from '../entities/audit-log.entity';

type AuditDisplayLabel = { entityName: string | null; actorName: string | null };

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('admin/audit-logs')
export class AdminAuditLogsController {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

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
    const labels = await this.auditLogsRepository.loadDisplayLabels(data);
    return buildPaginatedResult(
      data.map((row) => toAuditView(row, labels.get(row.id))),
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
    const labels = await this.auditLogsRepository.loadDisplayLabels([row]);
    return toAuditView(row, labels.get(row.id));
  }
}

function toAuditView(row: AuditLogEntity, lookedUp?: AuditDisplayLabel) {
  const stored = redactAuditDetails(row.details) ?? {};
  const entityName = text(stored.subjectName) ?? lookedUp?.entityName ?? null;
  const actorName = lookedUp?.actorName ?? null;
  const subjectLabel =
    text(stored.subjectLabel) ?? ([entityName, row.entityRefId].filter(Boolean).join(' · ') || null);
  const actorLabel = actorName && row.performedBy ? `${actorName} · ${row.performedBy}` : (actorName ?? row.performedBy);
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    entityRefId: row.entityRefId,
    entityName,
    subjectLabel,
    action: row.action,
    performedBy: row.performedBy,
    actorType: row.actorType,
    actorId: row.actorId,
    actorName,
    actorLabel,
    ipAddress: row.ipAddress,
    requestId: row.requestId,
    reliability: row.reliability,
    details: {
      ...stored,
      ...(entityName ? { subjectName: entityName } : {}),
      ...(row.entityId ? { subjectId: row.entityId } : {}),
      ...(row.entityRefId ? { subjectRefId: row.entityRefId } : {}),
      ...(subjectLabel ? { subjectLabel } : {}),
      ...(actorName ? { actorName } : {}),
      ...(row.actorId ? { actorId: row.actorId } : {}),
      ...(row.performedBy ? { actorEmail: row.performedBy } : {}),
    },
    createdAt: row.createdAt,
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
