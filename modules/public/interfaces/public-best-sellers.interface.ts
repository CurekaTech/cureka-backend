import { IPublicProductCard } from './public-product.interface';

/** One "Best Sellers" tab: a shop-by root category plus its top products. */
export interface IPublicBestSellersCategory {
  /** 1-based tab order for the frontend. */
  index: number;
  refId: string;
  name: string;
  slug: string;
  products: IPublicProductCard[];
}

export interface IPublicBestSellersSection {
  categories: IPublicBestSellersCategory[];
}
