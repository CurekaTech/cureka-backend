import { MasterStatus } from '@modules/master/enums/master-status.enum';

export interface IProductInformationLabel {
  id: string;
  refId: string;
  name: string;
  status: MasterStatus;
  sortOrder: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
