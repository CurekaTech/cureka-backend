import { IPublicProductCard } from './public-product.interface';

export interface IPublicWatchAndShopItem {
  refId: string;
  title: string | null;
  videoUrl: string | null;
  mediaUrl: string | { key: string; name: string; url: string } | null;
  sortOrder: number;
  product: IPublicProductCard;
}

export interface IPublicWatchAndShopSection {
  items: IPublicWatchAndShopItem[];
}
