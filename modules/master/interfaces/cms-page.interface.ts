import { MasterStatus } from '../enums/master-status.enum';

export interface ICmsPage {
  id: string;
  refId: string;
  title: string;
  slug: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: MasterStatus;
  isPredefined: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

/** Storefront / mobile response for GET /cms/:slug */
export interface IPublicCmsPage {
  title: string;
  slug: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: MasterStatus;
}
