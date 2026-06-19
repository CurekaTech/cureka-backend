import { MasterStatus } from '../enums/master-status.enum';
import { BannerPlacement } from '../enums/banner-placement.enum';
import { BannerSlot } from '../enums/banner-slot.enum';
import { BannerResourceType } from '../enums/banner-resource-type.enum';
import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IBanner {
  id: string;
  refId: string;
  placement: BannerPlacement;
  slot: BannerSlot;
  resourceType: BannerResourceType;
  resourceRefId: string | null;
  externalUrl: string | null;
  title: string;
  imageUrl: IStorageFileReferenceResponse;
  sortOrder: number;
  status: MasterStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface IStorefrontBannerItem {
  refId: string;
  title: string;
  imageUrl: IStorageFileReferenceResponse;
  ctaHref: string | null;
}

export interface IHomepageBannersBundle {
  hero: {
    primary: IStorefrontBannerItem[];
    secondary: IStorefrontBannerItem[];
  };
  mainPromo: IStorefrontBannerItem[];
  brandWise: {
    left: IStorefrontBannerItem[];
    right: IStorefrontBannerItem[];
  };
}
