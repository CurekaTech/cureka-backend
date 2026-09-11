import { IUnicommerceSaleOrderItemDto } from '../interfaces/unicommerce-order.interface';

const INELIGIBLE_ITEM_STATUSES = new Set([
  'CANCELLED',
  'REPLACED',
  'RETURNED',
  'RETURN_REQUESTED',
  'COURIER_RETURN',
]);

export type UnicommerceReversePickLine = {
  sku: string;
  quantity: number;
};

/**
 * Reconstructs the per-unit sale-order item codes Cureka sends on createSaleOrder
 * (`{orderNumber}-{n}` with quantity expanded). Used only when Uniware get-sale-order
 * is unavailable.
 */
export const reconstructUnicommerceSaleOrderItemCodes = (
  orderNumber: string,
  originalOrderItems: UnicommerceReversePickLine[],
): IUnicommerceSaleOrderItemDto[] => {
  const items: IUnicommerceSaleOrderItemDto[] = [];
  let index = 1;
  for (const line of originalOrderItems) {
    const quantity = Math.max(1, Math.floor(line.quantity) || 1);
    for (let unit = 0; unit < quantity; unit += 1) {
      items.push({
        code: `${orderNumber}-${index}`,
        itemSku: line.sku,
        statusCode: 'DELIVERED',
      });
      index += 1;
    }
  }
  return items;
};

/**
 * Picks `quantity` unused Uniware item codes per returned SKU.
 * Uniware reverse pickup is unit-level — there is no quantity field.
 */
export const selectUnicommerceReversePickItemCodes = (
  saleOrderItems: IUnicommerceSaleOrderItemDto[],
  returnedLines: UnicommerceReversePickLine[],
): string[] => {
  const remainingBySku = new Map<string, IUnicommerceSaleOrderItemDto[]>();

  for (const item of saleOrderItems) {
    const sku = item.itemSku?.trim();
    const code = item.code?.trim();
    if (!sku || !code) continue;
    const status = (item.statusCode ?? '').toUpperCase();
    if (INELIGIBLE_ITEM_STATUSES.has(status)) continue;
    const bucket = remainingBySku.get(sku) ?? [];
    bucket.push(item);
    remainingBySku.set(sku, bucket);
  }

  const selected: string[] = [];
  for (const line of returnedLines) {
    const needed = Math.max(1, Math.floor(line.quantity) || 1);
    const bucket = remainingBySku.get(line.sku) ?? [];
    if (bucket.length < needed) {
      throw new Error(
        `Unicommerce has ${bucket.length} eligible unit(s) for SKU ${line.sku} but the return needs ${needed}`,
      );
    }
    for (let i = 0; i < needed; i += 1) {
      const next = bucket.shift();
      if (next?.code) selected.push(next.code);
    }
    remainingBySku.set(line.sku, bucket);
  }

  return selected;
};
