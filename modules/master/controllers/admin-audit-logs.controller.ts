import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { buildPaginatedResult, buildPaginationOptions, ResponseMessage } from '@packages/common';
import { JwtAuthGuard, RolesGuard, Roles } from '@packages/auth';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { RequirePermissions } from '@modules/roles/decorators/permissions.decorator';
import { PermissionsGuard } from '@modules/roles/guards/permissions.guard';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLogsRepository } from '../repositories/audit-logs.repository';
import { toAuditDetailView, toAuditListView } from '../utils/audit-log.view';

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
      data.map((row) => toAuditListView(row, labels.get(row.id))),
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
    const [labels, changes] = await Promise.all([
      this.auditLogsRepository.loadDisplayLabels([row]),
      this.auditLogsRepository.findChanges(row.id),
    ]);
    return toAuditDetailView(row, labels.get(row.id), changes);
  }
}
