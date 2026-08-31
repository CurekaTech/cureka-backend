export interface IProductInformationItem {
  id: string;
  /** Master product_information_labels.refId — used for reliable label renames. */
  labelRefId?: string;
  label: string;
  description: string;
  sortOrder: number;
}

export interface IProductInformationItemInput {
  id?: string;
  labelRefId?: string;
  label: string;
  description: string;
  sortOrder?: number;
}

/** Public PDP / storefront shape — never expose internal labelRefId. */
export type PublicProductInformationItem = Pick<
  IProductInformationItem,
  'id' | 'label' | 'sortOrder' | 'description'
>;
