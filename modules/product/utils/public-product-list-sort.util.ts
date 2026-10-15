import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ReturnStatus } from '@modules/returns/enums/return-status.enum';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

/** Existing public list sorts, plus the three website options. */
export const PUBLIC_PRODUCT_LIST_SORT_FIELDS = [
  'name',
  'publishedAt',
  'price',
  'variantSlug',
  'bestsellerIndex',
  'popularity',
  'price_asc',
  'price_desc',
] as const;

export type PublicProductListSortField = (typeof PUBLIC_PRODUCT_LIST_SORT_FIELDS)[number];

export const EXPLICIT_PUBLIC_LIST_SORTS = ['popularity', 'price_asc', 'price_desc'] as const;

export type ExplicitPublicListSort = (typeof EXPLICIT_PUBLIC_LIST_SORTS)[number];

export const POPULARITY_WINDOW_DAYS = 7;

/** Paid enough to count. Fully refunded and unpaid orders are omitted. */
export const POPULARITY_PAYMENT_STATUSES: readonly OrderPaymentStatus[] = [
  OrderPaymentStatus.PAID,
  OrderPaymentStatus.PARTIALLY_PAID,
  OrderPaymentStatus.PARTIALLY_REFUNDED,
];

/** Cancelled, failed delivery, and returned-to-origin shipments are not sales. */
export const POPULARITY_EXCLUDED_ORDER_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.FAILED_DELIVERY,
  OrderStatus.RTO,
];

/** Only finished returns reduce the sold quantity. */
export const POPULARITY_COUNTED_RETURN_STATUSES: readonly ReturnStatus[] = [
  ReturnStatus.COMPLETED,
  ReturnStatus.REFUND_COMPLETED,
];

export const isExplicitPublicListSort = (
  sortBy: string | undefined,
): sortBy is ExplicitPublicListSort =>
  sortBy === 'popularity' || sortBy === 'price_asc' || sortBy === 'price_desc';

export const popularityWindowStart = (now: Date): Date =>
  new Date(now.getTime() - POPULARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

export const isWithinPopularityWindow = (soldAt: Date, now: Date): boolean =>
  soldAt.getTime() >= popularityWindowStart(now).getTime();

export const isPopularityOrderEligible = (
  paymentStatus: string,
  orderStatus: string,
): boolean =>
  POPULARITY_PAYMENT_STATUSES.includes(paymentStatus as OrderPaymentStatus) &&
  !POPULARITY_EXCLUDED_ORDER_STATUSES.includes(orderStatus as OrderStatus);

export const acceptedReturnUnits = (
  returns: ReadonlyArray<{ status: string; acceptedQuantity: number | null }>,
): number =>
  returns.reduce((sum, row) => {
    if (!POPULARITY_COUNTED_RETURN_STATUSES.includes(row.status as ReturnStatus)) {
      return sum;
    }
    if (row.acceptedQuantity == null || row.acceptedQuantity <= 0) {
      return sum;
    }
    return sum + row.acceptedQuantity;
  }, 0);

export const netSoldUnits = (quantity: number, acceptedReturnQuantity: number): number =>
  Math.max(quantity - Math.max(acceptedReturnQuantity, 0), 0);

export interface PopularitySaleInput {
  productId: string;
  quantity: number;
  soldAt: Date;
  paymentStatus: string;
  orderStatus: string;
  acceptedReturnQuantity: number;
}

export interface PopularityRank {
  productId: string;
  units: number;
  lastSaleAt: Date | null;
}

export const aggregatePopularity = (
  lines: readonly PopularitySaleInput[],
  now: Date,
): Map<string, PopularityRank> => {
  const byProduct = new Map<string, PopularityRank>();
  for (const line of lines) {
    if (!isPopularityOrderEligible(line.paymentStatus, line.orderStatus)) continue;
    if (!isWithinPopularityWindow(line.soldAt, now)) continue;
    const units = netSoldUnits(line.quantity, line.acceptedReturnQuantity);
    const current = byProduct.get(line.productId) ?? {
      productId: line.productId,
      units: 0,
      lastSaleAt: null,
    };
    current.units += units;
    if (units > 0 && (current.lastSaleAt == null || line.soldAt > current.lastSaleAt)) {
      current.lastSaleAt = line.soldAt;
    }
    byProduct.set(line.productId, current);
  }
  return byProduct;
};

export const comparePopularity = (left: PopularityRank, right: PopularityRank): number => {
  if (left.units !== right.units) return right.units - left.units;
  const leftSale = left.lastSaleAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightSale = right.lastSaleAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (leftSale !== rightSale) return rightSale - leftSale;
  return left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0;
};

export interface PublicPriceCandidate {
  sellingPrice: number;
  sellable: boolean;
}

export const eligibleSortPrice = (
  variants: readonly PublicPriceCandidate[],
  direction: 'asc' | 'desc',
): number | null => {
  const prices = variants.filter((variant) => variant.sellable).map((variant) => variant.sellingPrice);
  if (prices.length === 0) return null;
  return direction === 'asc' ? Math.min(...prices) : Math.max(...prices);
};

export const compareSortPrice = (
  left: { productId: string; price: number | null },
  right: { productId: string; price: number | null },
  direction: 'asc' | 'desc',
): number => {
  if (left.price == null && right.price == null) {
    return left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0;
  }
  if (left.price == null) return 1;
  if (right.price == null) return -1;
  if (left.price !== right.price) {
    return direction === 'asc' ? left.price - right.price : right.price - left.price;
  }
  return left.productId < right.productId ? -1 : left.productId > right.productId ? 1 : 0;
};

const sqlList = (values: readonly string[]): string => values.map((value) => `'${value}'`).join(', ');

/** Grouped 7-day net units by parent product. One row per product. */
export const popularitySalesSubquerySql = (): string => {
  const payments = sqlList(POPULARITY_PAYMENT_STATUSES);
  const excluded = sqlList(POPULARITY_EXCLUDED_ORDER_STATUSES);
  const returns = sqlList(POPULARITY_COUNTED_RETURN_STATUSES);
  return `
    SELECT
      item.product_id AS product_id,
      SUM(GREATEST(item.quantity - COALESCE(returned.accepted_quantity, 0), 0)) AS net_units,
      MAX(
        CASE
          WHEN GREATEST(item.quantity - COALESCE(returned.accepted_quantity, 0), 0) > 0
          THEN COALESCE(ord.placed_at, ord.created_at)
        END
      ) AS last_sale_at
    FROM order_items item
    INNER JOIN orders ord
      ON ord.id = item.order_id
      AND ord.deleted_at IS NULL
    LEFT JOIN (
      SELECT
        rri.order_item_id AS order_item_id,
        SUM(rri.accepted_quantity) AS accepted_quantity
      FROM return_request_items rri
      INNER JOIN return_requests rr
        ON rr.id = rri.return_request_id
        AND rr.deleted_at IS NULL
      WHERE rri.deleted_at IS NULL
        AND rri.accepted_quantity IS NOT NULL
        AND rr.status IN (${returns})
      GROUP BY rri.order_item_id
    ) returned ON returned.order_item_id = item.id
    WHERE item.deleted_at IS NULL
      AND COALESCE(ord.placed_at, ord.created_at) >= NOW() - INTERVAL '${POPULARITY_WINDOW_DAYS} days'
      AND ord.payment_status IN (${payments})
      AND ord.order_status NOT IN (${excluded})
    GROUP BY item.product_id
  `;
};

export const sellableVariantPriceSql = (
  aggregate: 'MIN' | 'MAX',
  sellableSql: string,
  pincodeSql: string,
): string =>
  `(SELECT ${aggregate}(pv.selling_price::numeric)
    FROM product_variants pv
    WHERE pv.product_id = product.id
      AND pv.deleted_at IS NULL
      AND pv.status = :publicListPriceVariantStatus
      AND ${sellableSql}
      AND ${pincodeSql})`;

export const joinPopularitySales = <Entity extends ObjectLiteral>(
  qb: SelectQueryBuilder<Entity>,
  productIdSql: string,
): void => {
  qb.leftJoin(
    (sub) =>
      sub
        .select('src.product_id', 'product_id')
        .addSelect('src.net_units', 'net_units')
        .addSelect('src.last_sale_at', 'last_sale_at')
        .from(`(${popularitySalesSubquerySql()})`, 'src'),
    'popularity_sales',
    `${productIdSql} = popularity_sales.product_id`,
  );
  qb.addSelect('COALESCE(popularity_sales.net_units, 0)', 'popularity_units');
  qb.addSelect('popularity_sales.last_sale_at', 'popularity_last_sale_at');
  qb.orderBy('popularity_units', 'DESC');
  qb.addOrderBy('popularity_last_sale_at', 'DESC', 'NULLS LAST');
};
