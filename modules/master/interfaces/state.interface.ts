import { MasterStatus } from '../enums/master-status.enum';
import { ICountrySummary } from './country.interface';

export interface IState {
  id: string;
  refId: string;
  name: string;
  code: string | null;
  countryRefId: string;
  country: ICountrySummary | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IStateSummary {
  id: string;
  refId: string;
  name: string;
  code: string | null;
  countryRefId: string;
}
