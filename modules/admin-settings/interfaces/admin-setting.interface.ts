import { AdminSettingStatus } from '../enums/admin-setting-status.enum';

export interface IAdminSetting {
  id: string;
  refId: string;
  key: string;
  value: string;
  status: AdminSettingStatus;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}
