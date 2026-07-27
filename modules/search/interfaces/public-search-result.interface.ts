import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { SearchEntityType } from '../constants/search-entity-type.constant';

export interface IPublicSearchResult {
  entityType: SearchEntityType;
  title: string;
  slug: string;
  refId: string;
  variantId?: string;
  /** Legacy storefront path (`/shop/.../`) when indexed on the variant. */
  productPageUrl?: string | null;
  /** Full product card when entityType is Product. */
  product?: IPublicProductCard;
}
