import { MasterStatus } from '../enums/master-status.enum';
import { IStateSummary } from './state.interface';

export interface ICity {
  id: string;
  refId: string;
  name: string;
  stateRefId: string;
  state: IStateSummary | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
