import { SearchEntityType } from '../constants/search-entity-type.constant';

export interface ITypesenseSearchRuntimeConfig {
  hasEntityType: boolean;
  hasInStock: boolean;
  hasPopularSortField: boolean;
  /** True after `isPincodeManaged` exists on the live collection. Until then, skip the filter. */
  hasIsPincodeManaged: boolean;
  productQueryBy: string;
  entityQueryBy: string;
  entityTypeFilters: Partial<Record<SearchEntityType, string>>;
}
