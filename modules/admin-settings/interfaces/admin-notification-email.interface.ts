import { AdminNotificationEmailType } from '../enums/admin-notification-email-type.enum';

export interface IAdminNotificationEmail {
  id: string;
  refId: string;
  email: string;
  type: AdminNotificationEmailType;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string | null;
  updatedBy?: string | null;
}
