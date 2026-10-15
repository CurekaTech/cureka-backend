import { ForbiddenException } from '@nestjs/common';
import { AdminUserRole } from '@modules/admin-users/enums/admin-user-role.enum';
import { UserRole } from '../enums/user-role.enum';

/** Admin panel roles a super admin may assign when creating admin_users. */
export const SUPER_ADMIN_ASSIGNABLE_ADMIN_ROLES: readonly AdminUserRole[] = [
  AdminUserRole.ADMIN,
  AdminUserRole.MODERATOR,
];

/** Website user roles admin panel may assign when creating staff (users table). */
export const ADMIN_PANEL_ASSIGNABLE_STAFF_ROLES: readonly UserRole[] = [
  UserRole.VENDOR,
  UserRole.TELECALLER,
];

export interface IAssignableRoles {
  adminUserRoles: AdminUserRole[];
  staffUserRoles: UserRole[];
}

export interface IUserTypeOption {
  label: string;
  role: AdminUserRole | UserRole;
  userTable: 'admin_users' | 'users';
}

const USER_TYPE_LABELS: Record<string, string> = {
  [AdminUserRole.SUPER_ADMIN]: 'Super Admin',
  [AdminUserRole.ADMIN]: 'Admin',
  [AdminUserRole.MODERATOR]: 'Moderator',
  [UserRole.VENDOR]: 'Vendor',
  [UserRole.TELECALLER]: 'Telecaller',
};

/** Same permission that shows the Audit Logs menu. */
export const AUDIT_LOGS_ACCESS_PERMISSION = 'audit_logs.read';

export function creatorHasAuditLogsAccess(
  creatorAdminRole: AdminUserRole,
  permissionCodes: readonly string[] = [],
): boolean {
  if (creatorAdminRole === AdminUserRole.SUPER_ADMIN) return true;
  return (
    permissionCodes.includes('*') || permissionCodes.includes(AUDIT_LOGS_ACCESS_PERMISSION)
  );
}

export function getAssignableRoles(
  creatorAdminRole: AdminUserRole,
  permissionCodes: readonly string[] = [],
): IAssignableRoles {
  const canManageStaff = [AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN].includes(creatorAdminRole);
  const canCreateAdminUsers = creatorHasAuditLogsAccess(creatorAdminRole, permissionCodes);

  return {
    adminUserRoles: canCreateAdminUsers
      ? [AdminUserRole.SUPER_ADMIN, ...SUPER_ADMIN_ASSIGNABLE_ADMIN_ROLES]
      : [],
    staffUserRoles: canManageStaff ? [...ADMIN_PANEL_ASSIGNABLE_STAFF_ROLES] : [],
  };
}

export function getUserTypeOptions(creatorAdminRole: AdminUserRole): IUserTypeOption[] {
  const assignableRoles = getAssignableRoles(creatorAdminRole);

  return [
    ...assignableRoles.adminUserRoles.map((role) => ({
      label: USER_TYPE_LABELS[role],
      role,
      userTable: 'admin_users' as const
    })),
    ...assignableRoles.staffUserRoles.map((role) => ({
      label: USER_TYPE_LABELS[role],
      role,
      userTable: 'users' as const
    })),
  ];
}

export function assertCanAssignAdminUserRole(
  creatorAdminRole: AdminUserRole,
  targetRole: AdminUserRole,
  permissionCodes: readonly string[] = [],
): void {
  if (!creatorHasAuditLogsAccess(creatorAdminRole, permissionCodes)) {
    throw new ForbiddenException('Only admins with Audit Logs access can create admin users');
  }

  const allowed = [AdminUserRole.SUPER_ADMIN, ...SUPER_ADMIN_ASSIGNABLE_ADMIN_ROLES];
  if (!allowed.includes(targetRole)) {
    throw new ForbiddenException(
      `Cannot assign admin role "${targetRole}". Allowed: ${allowed.join(', ')}`,
    );
  }
}

export function assertCanManageStaffUsers(creatorAdminRole: AdminUserRole): void {
  if (![AdminUserRole.SUPER_ADMIN, AdminUserRole.ADMIN].includes(creatorAdminRole)) {
    throw new ForbiddenException('Insufficient permissions to manage staff users');
  }
}

export function assertCanAssignStaffUserRole(
  creatorAdminRole: AdminUserRole,
  targetRole: UserRole,
): void {
  assertCanManageStaffUsers(creatorAdminRole);

  if (!ADMIN_PANEL_ASSIGNABLE_STAFF_ROLES.includes(targetRole)) {
    throw new ForbiddenException(
      `Cannot assign staff role "${targetRole}". Allowed: ${ADMIN_PANEL_ASSIGNABLE_STAFF_ROLES.join(', ')}`,
    );
  }
}
