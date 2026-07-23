import { randomUUID } from 'crypto';
import {
  IProductInformationItem,
  IProductInformationItemInput,
} from '../interfaces/product-information.interface';

export type ProductInformationLabelSortOrders = ReadonlyMap<string, number>;

export const sortProductInformation = (
  items: IProductInformationItem[],
): IProductInformationItem[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

const resolveSortOrder = (
  item: IProductInformationItemInput,
  index: number,
  labelSortOrders?: ProductInformationLabelSortOrders,
): number => {
  if (item.sortOrder !== undefined) {
    return item.sortOrder;
  }

  const labelSortOrder = labelSortOrders?.get(item.label);
  if (labelSortOrder !== undefined) {
    return labelSortOrder;
  }

  return index;
};

export const normalizeProductInformation = (
  items?: IProductInformationItemInput[] | null,
  labelSortOrders?: ProductInformationLabelSortOrders,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  const normalized = items.map((item, index) => ({
    id: item.id ?? randomUUID(),
    label: item.label,
    description: item.description,
    sortOrder: resolveSortOrder(item, index, labelSortOrders),
  }));

  return sortProductInformation(normalized);
};

export const enrichProductInformation = (
  items:
    | Array<{
        id: string;
        label: string;
        description: string;
        sortOrder?: number;
      }>
    | null
    | undefined,
  labelSortOrders?: ProductInformationLabelSortOrders,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  const enriched = items.map((item, index) => ({
    ...item,
    sortOrder: item.sortOrder ?? labelSortOrders?.get(item.label) ?? index,
  }));

  return sortProductInformation(enriched);
};
