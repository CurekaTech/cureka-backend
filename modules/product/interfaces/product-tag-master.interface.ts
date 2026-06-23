import { MasterStatus } from '@modules/master/enums/master-status.enum';

export interface IProductTagMaster {
  id: string;
  refId: string;
  name: string;
  slug: string;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
