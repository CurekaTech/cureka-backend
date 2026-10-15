import { SearchEntityType } from '../constants/search-entity-type.constant';

export interface ITypesenseSearchRuntimeConfig {
  hasEntityType: boolean;
  hasInStock: boolean;
  hasPopularSortField: boolean;
  /** True after `isPincodeManaged` exists on the live collection. Until then, skip the filter. */
  hasIsPincodeManaged: boolean;
  /** True after `nameCompact` exists. Primary query_by stays unchanged either way. */
  hasNameCompact?: boolean;
  /** True after the additive infix field is present on the collection. */
  hasSearchText?: boolean;
  productQueryBy: string;
  entityQueryBy: string;
  entityTypeFilters: Partial<Record<SearchEntityType, string>>;
}
