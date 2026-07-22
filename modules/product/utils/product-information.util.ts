import { randomUUID } from 'crypto';
import {
  IProductInformationItem,
  IProductInformationItemInput,
} from '../interfaces/product-information.interface';

export type ProductInformationLabelSortOrders = ReadonlyMap<string, number>;

export const sortProductInformation = (
  items: IProductInformationItem[],
): IProductInformationItem[] =>
  [...items].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
  );

const getLabelSortOrder = (
  label: string,
  labelSortOrders?: ProductInformationLabelSortOrders,
): number | undefined => {
  if (!labelSortOrders?.size) {
    return undefined;
  }

  const direct = labelSortOrders.get(label);
  if (direct !== undefined) {
    return direct;
  }

  const normalized = label.trim().toLowerCase();
  for (const [name, order] of labelSortOrders) {
    if (name.trim().toLowerCase() === normalized) {
      return order;
    }
  }

  return undefined;
};

/**
 * Prefer live master-label sort order from DB when the label exists.
 * Fall back to the value stored on the product/variant, then array index.
 */
const resolveSortOrder = (
  item: IProductInformationItemInput,
  index: number,
  labelSortOrders?: ProductInformationLabelSortOrders,
): number => {
  const labelSortOrder = getLabelSortOrder(item.label, labelSortOrders);
  if (labelSortOrder !== undefined) {
    return labelSortOrder;
  }

  if (item.sortOrder !== undefined) {
    return item.sortOrder;
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
  items: Array<{
    id: string;
    label: string;
    description: string;
    sortOrder?: number;
  }> | null | undefined,
  labelSortOrders?: ProductInformationLabelSortOrders,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  const enriched = items.map((item, index) => ({
    ...item,
    sortOrder: resolveSortOrder(item, index, labelSortOrders),
  }));

  return sortProductInformation(enriched);
};
