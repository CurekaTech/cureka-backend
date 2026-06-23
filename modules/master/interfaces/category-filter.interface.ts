import { MasterStatus } from '../enums/master-status.enum';

export interface ICategoryFilter {
  id: string;
  refId: string;
  name: string;
  status: MasterStatus;
  values: string[] | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
