import { WatchAndShopItemEntity } from '../entities/watch-and-shop-item.entity';
import {
  IStorefrontWatchAndShopItem,
  IWatchAndShopItem,
} from '../interfaces/watch-and-shop.interface';

export const mapWatchAndShopEntityToResponse = (
  entity: WatchAndShopItemEntity,
): IWatchAndShopItem =>
  ({
    id: entity.id,
    refId: entity.refId,
    title: entity.title,
    mediaType: entity.mediaType,
    mediaUrl: entity.mediaUrl,
    videoUrl: entity.videoUrl,
    productRefId: entity.productRefId,
    sortOrder: entity.sortOrder,
    status: entity.status,
    startsAt: entity.startsAt,
    endsAt: entity.endsAt,
    createdBy: entity.createdBy,
    updatedBy: entity.updatedBy,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  }) as unknown as IWatchAndShopItem;

export const mapWatchAndShopEntitiesToResponse = (
  entities: WatchAndShopItemEntity[],
): IWatchAndShopItem[] => entities.map(mapWatchAndShopEntityToResponse);

export const mapWatchAndShopToStorefrontItem = (
  entity: WatchAndShopItemEntity,
): IStorefrontWatchAndShopItem =>
  ({
    refId: entity.refId,
    title: entity.title,
    mediaType: entity.mediaType,
    mediaUrl: entity.mediaUrl,
    videoUrl: entity.videoUrl,
    productRefId: entity.productRefId,
    sortOrder: entity.sortOrder,
  }) as unknown as IStorefrontWatchAndShopItem;
