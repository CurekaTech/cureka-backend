import { PermissionEntity } from '../entities/permission.entity';
import { IPermission } from '../interfaces/permission.interface';

export const mapPermissionEntityToResponse = (entity: PermissionEntity): IPermission => ({
  id: entity.id,
  refId: entity.refId,
  code: entity.code,
  name: entity.name,
  module: entity.module,
  action: entity.action,
  description: entity.description,
  status: entity.status,
  createdBy: entity.createdBy,
  updatedBy: entity.updatedBy,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  deletedAt: entity.deletedAt,
});

export const mapPermissionEntitiesToResponse = (entities: PermissionEntity[]): IPermission[] =>
  entities.map(mapPermissionEntityToResponse);
