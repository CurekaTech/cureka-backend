export interface IBulkMarkOutOfStockResult {
  requested: number;
  updated: string[];
  alreadyOutOfStock: string[];
  notFound: string[];
  variantsUpdated: number;
}
