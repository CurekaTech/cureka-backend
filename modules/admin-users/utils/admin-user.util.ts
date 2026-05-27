import { AdminUserRole } from '../enums/admin-user-role.enum';

export const isSuperAdmin = (role: AdminUserRole): boolean => role === AdminUserRole.SUPER_ADMIN;

export const canManageAdmins = (role: AdminUserRole): boolean =>
  role === AdminUserRole.SUPER_ADMIN || role === AdminUserRole.ADMIN;

export const buildAdminUserSelectFields = (): (keyof import('../entities/admin-user.entity').AdminUserEntity)[] =>
  ['id', 'fullName', 'email', 'phone', 'role', 'isActive', 'lastLoginAt', 'createdAt', 'updatedAt'];
