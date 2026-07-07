import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';

export interface IWishlistResponse {
  items: IPublicProductCard[];
}

export interface IWishlistIdsResponse {
  productIds: string[];
}
