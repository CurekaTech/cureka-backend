import { SearchEntityType } from '../constants/search-entity-type.constant';

export interface ITypesenseSearchRuntimeConfig {
  hasEntityType: boolean;
  hasPopularSortField: boolean;
  productQueryBy: string;
  entityQueryBy: string;
  entityTypeFilters: Partial<Record<SearchEntityType, string>>;
}
