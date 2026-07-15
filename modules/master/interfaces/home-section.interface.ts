import { MasterStatus } from '../enums/master-status.enum';
import { HomeSectionType } from '../enums/home-section-type.enum';
import { HomeSectionBannerItem } from '../entities/home-section.entity';

export interface IHomeSection {
  id: string;
  refId: string;
  title: string;
  slug: string;
  type: HomeSectionType;
  index: number;
  status: MasterStatus;
  banners: HomeSectionBannerItem[] | null;
  productRefIds: string[] | null;
  categoryRefIds: string[] | null;
  pageTitle: string | null;
  pageDescription: string | null;
  pageCanonicalUrl: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHomeSectionListResponse {
  sections: IHomeSection[];
}
