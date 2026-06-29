export type UnicommerceInventoryUpdateStatus = 'SUCCESS' | 'FAILED' | 'PARTIAL_SUCCESS';

export interface IUnicommerceInventoryListItem {
  productId: string;
  variantId: string;
  inventory: string;
  hsnCode?: string;
  facilityCode?: string;
}

export interface IUnicommerceUpdateInventoryRequest {
  inventoryList: IUnicommerceInventoryListItem[];
}

export interface IUnicommerceFailedInventoryItem {
  productId: string;
  variantId: string;
  message: string;
}

export interface IUnicommerceUpdateInventoryResponse {
  status: UnicommerceInventoryUpdateStatus;
  failedProductList?: IUnicommerceFailedInventoryItem[];
}
