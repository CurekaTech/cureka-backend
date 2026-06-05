import { MasterStatus } from '../enums/master-status.enum';

export interface IBrand {
  id: string;
  refId: string;
  name: string;
  slug: string;
  logo: string | null;
  banner: string | null;
  description: string | null;
  status: MasterStatus;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string[] | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
