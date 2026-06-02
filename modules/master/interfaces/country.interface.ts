import { MasterStatus } from '../enums/master-status.enum';

export interface ICountry {
  id: string;
  refId: string;
  name: string;
  code: string;
  phoneCode: string | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ICountrySummary {
  id: string;
  refId: string;
  name: string;
  code: string;
}
