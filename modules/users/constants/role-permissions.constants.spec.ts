import { ForbiddenException } from '@nestjs/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import {
  assertCanAssignAdminUserRole,
  getAssignableRoles,
} from './role-permissions.constants';

describe('admin user role assignment', () => {
  it('lets a super admin assign the super_admin role', () => {
    expect(() =>
      assertCanAssignAdminUserRole(AdminUserRole.SUPER_ADMIN, AdminUserRole.SUPER_ADMIN),
    ).not.toThrow();
    expect(getAssignableRoles(AdminUserRole.SUPER_ADMIN).adminUserRoles).toContain(
      AdminUserRole.SUPER_ADMIN,
    );
  });

  it('lets an admin with Audit Logs access create admin users', () => {
    expect(() =>
      assertCanAssignAdminUserRole(AdminUserRole.ADMIN, AdminUserRole.SUPER_ADMIN, [
        'audit_logs.read',
      ]),
    ).not.toThrow();
  });

  it('rejects an admin without Audit Logs access', () => {
    expect(() =>
      assertCanAssignAdminUserRole(AdminUserRole.ADMIN, AdminUserRole.ADMIN, ['orders.read']),
    ).toThrow(ForbiddenException);
  });
});
