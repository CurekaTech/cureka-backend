import { MasterStatus } from '../enums/master-status.enum';

export interface IAgeGroup {
  id: string;
  refId: string;
  name: string;
  fromYears: number;
  fromMonths: number;
  toYears: number;
  toMonths: number;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
