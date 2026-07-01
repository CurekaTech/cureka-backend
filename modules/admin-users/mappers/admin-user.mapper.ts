import { AdminUserEntity } from '../entities/admin-user.entity';
import { IAdminUser } from '../interfaces/admin-user.interface';
import { mapRoleEntityToResponse } from '@modules/roles/mappers/role.mapper';

export const mapAdminUserEntityToResponse = (entity: AdminUserEntity): IAdminUser => ({
  id: entity.id,
  refId: entity.refId,
  fullName: entity.fullName,
  email: entity.email,
  phone: entity.phone,
  role: entity.role,
  roleId: entity.roleId,
  roleRecord: entity.roleRecord ? mapRoleEntityToResponse(entity.roleRecord) : undefined,
  isActive: entity.isActive,
  lastLoginAt: entity.lastLoginAt,
  createdBy: entity.createdBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapAdminUserEntitiesToResponse = (entities: AdminUserEntity[]): IAdminUser[] =>
  entities.map(mapAdminUserEntityToResponse);
