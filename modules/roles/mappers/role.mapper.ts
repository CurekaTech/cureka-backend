import { RoleEntity } from '../entities/role.entity';
import { IRole } from '../interfaces/role.interface';
import { mapPermissionEntitiesToResponse } from './permission.mapper';

export const mapRoleEntityToResponse = (entity: RoleEntity): IRole => ({
  id: entity.id,
  refId: entity.refId,
  name: entity.name,
  slug: entity.slug,
  description: entity.description,
  status: entity.status,
  isSystem: entity.isSystem,
  permissions: mapPermissionEntitiesToResponse(entity.permissions ?? []),
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapRoleEntitiesToResponse = (entities: RoleEntity[]): IRole[] =>
  entities.map(mapRoleEntityToResponse);
