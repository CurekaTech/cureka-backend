import { MasterStatus } from '../enums/master-status.enum';
import { PatientAudience } from '../enums/patient-audience.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IHealthConcern {
  id: string;
  refId: string;
  name: string;
  icon: IStorageFileReferenceResponse | null;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  medicalConditionName: string | null;
  patientAudience: PatientAudience | null;
  banner: IStorageFileReferenceResponse | null;
  faqBanner: IStorageFileReferenceResponse | null;
  status: MasterStatus;
  inHomePage: boolean;
  sortIndex: number | null;
  faqs: Array<{ question: string; answer: string; sequence: number }>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
