import { MasterStatus } from '../enums/master-status.enum';

export interface IUnit {
  id: string;
  refId: string;
  name: string;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
