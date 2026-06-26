export interface IProductInformationItem {
  id: string;
  label: string;
  description: string;
  sortOrder: number;
}

export interface IProductInformationItemInput {
  id?: string;
  label: string;
  description: string;
  sortOrder?: number;
}
