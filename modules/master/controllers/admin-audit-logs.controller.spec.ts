import { PERMISSIONS_KEY } from '@modules/roles/decorators/permissions.decorator';
import { AdminAuditLogsController } from './admin-audit-logs.controller';

describe('AdminAuditLogsController RBAC', () => {
  it('requires audit_logs.read on list and detail', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminAuditLogsController.prototype.findAll),
    ).toEqual(['audit_logs.read']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminAuditLogsController.prototype.findOne),
    ).toEqual(['audit_logs.read']);
  });
});
