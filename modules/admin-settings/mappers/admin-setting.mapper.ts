import { AdminSettingEntity } from '../entities/admin-setting.entity';
import { IAdminSetting } from '../interfaces/admin-setting.interface';

export const mapAdminSettingEntityToResponse = (entity: AdminSettingEntity): IAdminSetting => ({
  id: entity.id,
  refId: entity.refId,
  key: entity.key,
  value: entity.value,
  status: entity.status,
  description: entity.description,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

export const mapAdminSettingEntitiesToResponse = (entities: AdminSettingEntity[]): IAdminSetting[] =>
  entities.map(mapAdminSettingEntityToResponse);
