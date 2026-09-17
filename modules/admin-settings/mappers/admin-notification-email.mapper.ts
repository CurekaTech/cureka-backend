import { AdminNotificationEmailEntity } from '../entities/admin-notification-email.entity';
import { IAdminNotificationEmail } from '../interfaces/admin-notification-email.interface';

export const mapAdminNotificationEmail = (
  entity: AdminNotificationEmailEntity,
): IAdminNotificationEmail => ({
  id: entity.id,
  refId: entity.refId,
  email: entity.email,
  type: entity.type,
  isActive: entity.isActive,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
  createdBy: entity.createdBy ?? null,
  updatedBy: entity.updatedBy ?? null,
});
