import { CategoryHierarchyLevel } from '@modules/master/enums/category-hierarchy-level.enum';
import { IStorageFileReference, IStorageFileReferenceResponse } from '@packages/storage';

export interface IPublicCategoryFilterFacet {
  refId: string;
  name: string;
  /**
   * Distinct values from published products in this category tree.
   * Empty when no published products are bound to the filter in this listing.
   */
  values: string[];
}

/** Category metadata returned when the product list is scoped by categorySlug/categoryRefId. */
export interface IPublicCategoryProductListingContext {
  refId: string;
  name: string;
  /** HTML H1 for the root category. Null means render `name` as plain text. */
  listingHeading: string | null;
  slug: string;
  /** Ordered category slugs from root → current listing category (usually root). */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda */
  permalink: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  aboveTheFold: string | null;
  belowTheFold: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  faqs: Array<{ question: string; answer: string; sequence: number }>;
  categoryFilters: IPublicCategoryFilterFacet[];
  /** Set when the listing is filtered by a child category (non-root). */
  selectedCategory?: {
    refId: string;
    name: string;
    /** This category's own HTML H1. No parent fallback. */
    listingHeading: string | null;
    slug: string;
    slugPath: string[];
    permalink: string;
    image: IStorageFileReference | IStorageFileReferenceResponse | null;
    imageAltText: string | null;
    banner: IStorageFileReference | IStorageFileReferenceResponse | null;
    bannerAltText: string | null;
    faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
    faqBannerAltText: string | null;
    aboveTheFold: string | null;
    belowTheFold: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
    faqs: Array<{ question: string; answer: string; sequence: number }>;
  } | null;
}

export interface IPublicCategoryTree {
  refId: string;
  name: string;
  slug: string;
  /** Ordered category slugs from root → this node. */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda/herbal-oil/castor-oil */
  permalink: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  imageAltText: string | null;
  banner: IStorageFileReference | IStorageFileReferenceResponse | null;
  bannerAltText: string | null;
  faqBanner: IStorageFileReference | IStorageFileReferenceResponse | null;
  faqBannerAltText: string | null;
  position: number;
  hierarchyLevel: CategoryHierarchyLevel;
  isInHeader: boolean;
  isInShopBy: boolean;
  children: IPublicCategoryTree[];
}

export interface IPublicHeaderCategory {
  refId: string;
  name: string;
  slug: string;
  /** Ordered category slugs from root → this node. */
  slugPath: string[];
  /** Legacy-compatible path, e.g. /product-category/herbal-ayurveda/herbal-oil/castor-oil */
  permalink: string;
  children: IPublicHeaderCategory[];
}

/** Homepage shop-by-category tile — no nested children or unused tree flags. */
export interface IPublicShopByCategoryTile {
  refId: string;
  name: string;
  slug: string;
  slugPath: string[];
  permalink: string;
  image: IStorageFileReference | IStorageFileReferenceResponse | null;
  imageAltText: string | null;
  position: number;
}
