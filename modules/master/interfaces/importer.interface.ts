import { MasterStatus } from '../enums/master-status.enum';
import { ICitySummary } from './city.interface';
import { IStateSummary } from './state.interface';
import { ICountrySummary } from './country.interface';

export interface IImporter {
  id: string;
  refId: string;
  name: string;
  code: string;
  iec: string | null;
  logo: string | null;
  contactPerson: string | null;
  email: string | null;
  mobileNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  landmark: string | null;
  cityId: string | null;
  stateId: string | null;
  countryId: string | null;
  city: ICitySummary | null;
  state: IStateSummary | null;
  country: ICountrySummary | null;
  pinCode: string | null;
  gstNumber: string | null;
  drugLicenseNumber: string | null;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
