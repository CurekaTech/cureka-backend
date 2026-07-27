import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';

export interface IWishlistResponse {
  items: IPublicProductCard[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface IWishlistIdsResponse {
  productIds: string[];
}
