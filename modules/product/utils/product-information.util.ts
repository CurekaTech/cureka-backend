import { randomUUID } from 'crypto';
import {
  IProductInformationItem,
  IProductInformationItemInput,
} from '../interfaces/product-information.interface';

export const normalizeProductInformation = (
  items?: IProductInformationItemInput[] | null,
): IProductInformationItem[] => {
  if (!items?.length) {
    return [];
  }

  return items.map((item) => ({
    id: item.id ?? randomUUID(),
    label: item.label,
    description: item.description,
  }));
};
