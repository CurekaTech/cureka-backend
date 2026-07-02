import { RoleEntity } from '../entities/role.entity';
import { IRole } from '../interfaces/role.interface';
import { mapPermissionEntitiesToResponse } from './permission.mapper';

export const mapRoleEntityToResponse = (entity: RoleEntity): IRole => {
  const permissions = entity.permissions ?? [];
  const sortedPermissions = [...permissions].sort((a, b) => {
    const moduleCompare = (a.module || '').localeCompare(b.module || '');
    if (moduleCompare !== 0) return moduleCompare;
    const actionCompare = (a.action || '').localeCompare(b.action || '');
    if (actionCompare !== 0) return actionCompare;
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    id: entity.id,
    refId: entity.refId,
    name: entity.name,
    slug: entity.slug,
    description: entity.description,
    status: entity.status,
    isSystem: entity.isSystem,
    permissions: mapPermissionEntitiesToResponse(sortedPermissions),
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
};

export const mapRoleEntitiesToResponse = (entities: RoleEntity[]): IRole[] =>
  entities.map(mapRoleEntityToResponse);
