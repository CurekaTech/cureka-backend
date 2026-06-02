import { MasterStatus } from '../enums/master-status.enum';

export interface IHealthConcern {
  id: string;
  refId: string;
  name: string;
  icon: string | null;
  slug: string;
  description: string | null;
  banner: string | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
