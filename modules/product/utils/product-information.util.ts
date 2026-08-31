import { randomUUID } from 'crypto';
import {
  IProductInformationItem,
  IProductInformationItemInput,
  PublicProductInformationItem,
} from '../interfaces/product-information.interface';

export type ProductInformationLabelSortOrders = ReadonlyMap<string, number>;
export type ProductInformationLabelRefIdsByName = ReadonlyMap<string, string>;

export type ProductInformationLabelMaster = {
  refId: string;
  name: string;
  sortOrder: number;
};

export type ProductInformationLabelCatalog = {
  sortOrdersByName: ReadonlyMap<string, number>;
  labelsByRefId: ReadonlyMap<string, { name: string; sortOrder: number }>;
  byNormalizedName: ReadonlyMap<string, ProductInformationLabelMaster>;
};

export const buildProductInformationLabelCatalog = (
  labels: ProductInformationLabelMaster[],
): ProductInformationLabelCatalog => {
  const sortOrdersByName = new Map<string, number>();
  const labelsByRefId = new Map<string, { name: string; sortOrder: number }>();
  const byNormalizedName = new Map<string, ProductInformationLabelMaster>();

  for (const label of labels) {
    sortOrdersByName.set(label.name, label.sortOrder);
    labelsByRefId.set(label.refId, { name: label.name, sortOrder: label.sortOrder });
    byNormalizedName.set(label.name.trim().toLowerCase(), label);
  }

  return { sortOrdersByName, labelsByRefId, byNormalizedName };
};

export type NormalizeProductInformationOptions = {
  labelSortOrders?: ProductInformationLabelSortOrders;
  labelRefIdsByName?: ProductInformationLabelRefIdsByName;
};

export const sortProductInformation = (
  items: IProductInformationItem[],
): IProductInformationItem[] =>
  [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

const lookupByNormalizedName = <T>(
  label: string,
  values?: ReadonlyMap<string, T>,
): T | undefined => {
  if (!values?.size) {
    return undefined;
  }

  const direct = values.get(label);
  if (direct !== undefined) {
    return direct;
  }

  const normalized = label.trim().toLowerCase();
  for (const [name, value] of values) {
    if (name.trim().toLowerCase() === normalized) {
      return value;
    }
  }

  return undefined;
};

const getLabelSortOrder = (
  label: string,
  labelSortOrders?: ProductInformationLabelSortOrders,
): number | undefined => lookupByNormalizedName(label, labelSortOrders);

const resolveLabelRefId = (
  item: IProductInformationItemInput,
  labelRefIdsByName?: ProductInformationLabelRefIdsByName,
): string | undefined => {
  const explicit = item.labelRefId?.trim();
  if (explicit) {
    return explicit;
  }

  return lookupByNormalizedName(item.label, labelRefIdsByName);
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

const toNormalizeOptions = (
  options?: NormalizeProductInformationOptions,
): NormalizeProductInformationOptions => options ?? {};

export const normalizeProductInformation = (
  items?: IProductInformationItemInput[] | null,
  options?: NormalizeProductInformationOptions,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  const { labelSortOrders, labelRefIdsByName } = toNormalizeOptions(options);

  const normalized = items.map((item, index) => {
    const labelRefId = resolveLabelRefId(item, labelRefIdsByName);
    return {
      id: item.id ?? randomUUID(),
      ...(labelRefId ? { labelRefId } : {}),
      label: item.label,
      description: item.description,
      sortOrder: resolveSortOrder(item, index, labelSortOrders),
    };
  });

  return sortProductInformation(normalized);
};

export const enrichProductInformation = (
  items:
    | Array<{
        id: string;
        labelRefId?: string;
        label: string;
        description: string;
        sortOrder?: number;
      }>
    | null
    | undefined,
  catalog?: ProductInformationLabelCatalog,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  const enriched = items.map((item, index) => {
    const masterByRefId = item.labelRefId
      ? catalog?.labelsByRefId.get(item.labelRefId)
      : undefined;
    const masterByName = lookupByNormalizedName(item.label, catalog?.byNormalizedName);

    const master = masterByRefId
      ? {
          refId: item.labelRefId!,
          name: masterByRefId.name,
          sortOrder: masterByRefId.sortOrder,
        }
      : masterByName;

    if (master) {
      return {
        ...item,
        labelRefId: item.labelRefId ?? master.refId,
        label: master.name,
        sortOrder: master.sortOrder,
      };
    }

    return {
      ...item,
      sortOrder: resolveSortOrder(item, index, catalog?.sortOrdersByName),
    };
  });

  return sortProductInformation(enriched);
};

export const toPublicProductInformation = (
  items: IProductInformationItem[],
): PublicProductInformationItem[] =>
  items.map(({ id, label, sortOrder, description }) => ({
    id,
    label,
    sortOrder,
    description,
  }));

/** Enrich from master labels, then return the fixed public PDP shape. */
export const enrichPublicProductInformation = (
  items:
    | Array<{
        id: string;
        labelRefId?: string;
        label: string;
        description: string;
        sortOrder?: number;
      }>
    | null
    | undefined,
  catalog?: ProductInformationLabelCatalog,
): PublicProductInformationItem[] =>
  toPublicProductInformation(enrichProductInformation(items, catalog));
