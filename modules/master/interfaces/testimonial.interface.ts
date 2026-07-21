import { IStorageFileReferenceResponse } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';

export interface ITestimonial {
  id: string;
  refId: string;
  name: string;
  city: string;
  rating: number;
  description: string;
  image: IStorageFileReferenceResponse | null;
  sortOrder: number;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IStorefrontTestimonial {
  refId: string;
  name: string;
  city: string;
  rating: number;
  description: string;
  image: IStorageFileReferenceResponse | null;
  sortOrder: number;
}
