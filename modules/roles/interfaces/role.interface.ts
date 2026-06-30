import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { IPermission } from './permission.interface';

export interface IRole {
  id: string;
  refId: string;
  name: string;
  slug: string;
  description?: string;
  status: MasterStatus;
  isSystem: boolean;
  permissions: IPermission[];
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
