import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';

export interface IHomeSection {
  id: string;
  refId: string;
  title: string;
  slug: string;
  type: HomeSectionType;
  index: number;
  status: MasterStatus;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHomeSectionListResponse {
  sections: IHomeSection[];
}
