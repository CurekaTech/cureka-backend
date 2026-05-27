import { AdminUserEntity } from '../entities/admin-user.entity';
import { IAdminUser } from '../interfaces/admin-user.interface';

export const mapAdminUserEntityToResponse = (entity: AdminUserEntity): IAdminUser => ({
  id: entity.id,
  fullName: entity.fullName,
  email: entity.email,
  phone: entity.phone,
  role: entity.role,
  isActive: entity.isActive,
  lastLoginAt: entity.lastLoginAt,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapAdminUserEntitiesToResponse = (entities: AdminUserEntity[]): IAdminUser[] =>
  entities.map(mapAdminUserEntityToResponse);
