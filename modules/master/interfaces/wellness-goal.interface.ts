import { MasterStatus } from '../enums/master-status.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IWellnessGoal {
  id: string;
  refId: string;
  name: string;
  description: string | null;
  image: IStorageFileReferenceResponse | null;
  status: MasterStatus;
  inHomePage: boolean;
  faqs: Array<{ question: string; answer: string }>;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
