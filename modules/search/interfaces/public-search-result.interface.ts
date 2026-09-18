import { SearchEntityType } from '../constants/search-entity-type.constant';

/** Optional Product-hit helpers for dropdown links. Not a full list card. */
export interface IPublicSearchProductHelpers {
  permalink?: string | null;
  categorySlugPath?: string[];
}

export interface IPublicSearchResult {
  entityType: SearchEntityType;
  title: string;
  slug: string;
  refId: string;
  /** Legacy storefront path (`/shop/.../`) when indexed on the variant. */
  productPageUrl?: string | null;
  /**
   * Full nested category listing path (`/product-category/l1/l2/...`).
   * Required for nested categories — leaf-only `/product-category/{slug}` 404s.
   */
  permalink?: string | null;
  /** Product hits only — permalink / category path helpers, never a full card. */
  product?: IPublicSearchProductHelpers;
}
