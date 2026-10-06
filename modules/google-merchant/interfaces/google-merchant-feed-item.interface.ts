export interface IGoogleMerchantFeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: 'in_stock' | 'out_of_stock';
  price: string;
  condition: 'new';
  brand: string;
  gtin: string | null;
  mpn: string;
  itemGroupId: string;
  sku: string;
  /** For export sheet sale_price column when different from MRP display; we use selling only. */
  salePrice: string | null;
}

export interface IGoogleMerchantFeedBuildResult {
  items: IGoogleMerchantFeedItem[];
  itemCount: number;
  skippedMissingLink: number;
  skippedMissingImage: number;
  skippedMissingTitle: number;
  sheetIdHits: number;
  generatedIds: number;
}
