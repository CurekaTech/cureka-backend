import { MasterStatus } from '@modules/master/enums/master-status.enum';
import { PermissionAction } from '../enums/permission-action.enum';

export interface IPermission {
  id: string;
  refId: string;
  code: string;
  name: string;
  module: string;
  action: PermissionAction;
  description?: string;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
