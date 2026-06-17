import { MasterStatus } from '../enums/master-status.enum';

export interface IWellnessGoal {
  id: string;
  refId: string;
  name: string;
  image: string | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
