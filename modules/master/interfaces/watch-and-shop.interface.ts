import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';
import { MasterStatus } from '../enums/master-status.enum';
import { WatchAndShopMediaType } from '../enums/watch-and-shop-media-type.enum';

export interface IWatchAndShopItem {
  id: string;
  refId: string;
  title: string | null;
  mediaType: WatchAndShopMediaType;
  mediaUrl: IStorageFileReferenceResponse | null;
  videoUrl: string | null;
  productRefId: string;
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

export interface IStorefrontWatchAndShopItem {
  refId: string;
  title: string | null;
  mediaType: WatchAndShopMediaType;
  mediaUrl: IStorageFileReference | IStorageFileReferenceResponse | null;
  videoUrl: string | null;
  productRefId: string;
  sortOrder: number;
}
