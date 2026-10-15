import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ADMIN_PRODUCT_LIST_SORT_FIELDS } from '../constants/admin-product-list-sort.constants';
import { PublicProductQueryDto } from '@modules/public/dto/public-product-query.dto';
import {
  PopularityRank,
  PopularitySaleInput,
  acceptedReturnUnits,
  aggregatePopularity,
  comparePopularity,
  compareSortPrice,
  eligibleSortPrice,
  popularitySalesSubquerySql,
  sellableVariantPriceSql,
} from './public-product-list-sort.util';

const NOW = new Date('2026-10-15T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (days: number): Date => new Date(NOW.getTime() - days * DAY);

const sale = (overrides: Partial<PopularitySaleInput> & Pick<PopularitySaleInput, 'productId' | 'quantity'>): PopularitySaleInput => ({
  soldAt: daysAgo(1),
  paymentStatus: OrderPaymentStatus.PAID,
  orderStatus: OrderStatus.DELIVERED,
  acceptedReturnQuantity: 0,
  ...overrides,
});

const rankOf = (lines: PopularitySaleInput[], productId: string): PopularityRank =>
  aggregatePopularity(lines, NOW).get(productId) ?? {
    productId,
    units: 0,
    lastSaleAt: null,
  };

const popularityOrder = (productIds: string[], lines: PopularitySaleInput[]): string[] => {
  const ranks = productIds.map((productId) => rankOf(lines, productId));
  return [...ranks].sort(comparePopularity).map((row) => row.productId);
};

describe('public product list sort', () => {
  it('ranks products by eligible units sold in the last 7 days', () => {
    const lines = [
      sale({ productId: 'low', quantity: 1 }),
      sale({ productId: 'high', quantity: 4 }),
      sale({ productId: 'mid', quantity: 2 }),
    ];

    expect(popularityOrder(['low', 'mid', 'high'], lines)).toEqual(['high', 'mid', 'low']);
  });

  it('ignores sales outside the rolling 7-day window', () => {
    const lines = [
      sale({ productId: 'recent', quantity: 1, soldAt: daysAgo(6) }),
      sale({ productId: 'stale', quantity: 20, soldAt: daysAgo(8) }),
    ];

    expect(rankOf(lines, 'recent').units).toBe(1);
    expect(rankOf(lines, 'stale').units).toBe(0);
    expect(popularityOrder(['stale', 'recent'], lines)).toEqual(['recent', 'stale']);
  });

  it('places products with zero sales after products with sales', () => {
    const lines = [sale({ productId: 'sold', quantity: 1 })];

    expect(popularityOrder(['none', 'sold'], lines)).toEqual(['sold', 'none']);
  });

  it('adds every variant of a product into one sales total', () => {
    const lines = [
      sale({ productId: 'parent', quantity: 2 }),
      sale({ productId: 'parent', quantity: 3 }),
      sale({ productId: 'other', quantity: 4 }),
    ];

    expect(rankOf(lines, 'parent').units).toBe(5);
    expect(popularityOrder(['other', 'parent'], lines)).toEqual(['parent', 'other']);
  });

  it('does not count cancelled, failed, unpaid, or returned shipments', () => {
    const lines = [
      sale({ productId: 'kept', quantity: 1 }),
      sale({ productId: 'cancelled', quantity: 9, orderStatus: OrderStatus.CANCELLED }),
      sale({ productId: 'failed', quantity: 9, orderStatus: OrderStatus.FAILED_DELIVERY }),
      sale({ productId: 'rto', quantity: 9, orderStatus: OrderStatus.RTO }),
      sale({ productId: 'unpaid', quantity: 9, paymentStatus: OrderPaymentStatus.PENDING }),
      sale({ productId: 'payment-failed', quantity: 9, paymentStatus: OrderPaymentStatus.FAILED }),
      sale({ productId: 'refunded', quantity: 9, paymentStatus: OrderPaymentStatus.REFUNDED }),
    ];

    expect(popularityOrder(['cancelled', 'failed', 'rto', 'unpaid', 'kept'], lines)).toEqual([
      'kept',
      'cancelled',
      'failed',
      'rto',
      'unpaid',
    ]);
    expect(rankOf(lines, 'payment-failed').units).toBe(0);
    expect(rankOf(lines, 'refunded').units).toBe(0);
  });

  it('subtracts full and partial accepted return quantities', () => {
    expect(
      acceptedReturnUnits([
        { status: 'QC_PENDING', acceptedQuantity: 2 },
        { status: 'COMPLETED', acceptedQuantity: 1 },
        { status: 'REFUND_COMPLETED', acceptedQuantity: 1 },
      ]),
    ).toBe(2);

    const lines = [
      sale({ productId: 'partial', quantity: 4, acceptedReturnQuantity: 1 }),
      sale({ productId: 'full', quantity: 3, acceptedReturnQuantity: 3 }),
      sale({ productId: 'open-return', quantity: 2, acceptedReturnQuantity: 0 }),
    ];

    expect(rankOf(lines, 'partial').units).toBe(3);
    expect(rankOf(lines, 'full').units).toBe(0);
    expect(rankOf(lines, 'full').lastSaleAt).toBeNull();
    expect(popularityOrder(['full', 'partial', 'open-return'], lines)).toEqual([
      'partial',
      'open-return',
      'full',
    ]);
  });

  it('breaks equal sales by the latest contributing sale, then product id', () => {
    const lines = [
      sale({ productId: 'older', quantity: 2, soldAt: daysAgo(3) }),
      sale({ productId: 'newer', quantity: 2, soldAt: daysAgo(1) }),
      sale({ productId: 'b-same', quantity: 2, soldAt: daysAgo(2) }),
      sale({ productId: 'a-same', quantity: 2, soldAt: daysAgo(2) }),
      sale({
        productId: 'newer',
        quantity: 5,
        soldAt: daysAgo(4),
        acceptedReturnQuantity: 5,
      }),
    ];

    expect(popularityOrder(['older', 'b-same', 'a-same', 'newer'], lines)).toEqual([
      'newer',
      'a-same',
      'b-same',
      'older',
    ]);
  });

  it('sorts by the lowest sellable price ascending and the highest descending', () => {
    const priced = [
      { productId: 'cheap', price: 10 },
      { productId: 'mid', price: 20 },
      { productId: 'dear', price: 30 },
      { productId: 'unsellable', price: null },
    ];

    expect([...priced].sort((left, right) => compareSortPrice(left, right, 'asc')).map((row) => row.productId)).toEqual([
      'cheap',
      'mid',
      'dear',
      'unsellable',
    ]);
    expect([...priced].sort((left, right) => compareSortPrice(left, right, 'desc')).map((row) => row.productId)).toEqual([
      'dear',
      'mid',
      'cheap',
      'unsellable',
    ]);
  });

  it('uses only sellable variants for a variable product', () => {
    const variants = [
      { sellingPrice: 50, sellable: false },
      { sellingPrice: 80, sellable: true },
      { sellingPrice: 120, sellable: true },
    ];

    expect(eligibleSortPrice(variants, 'asc')).toBe(80);
    expect(eligibleSortPrice(variants, 'desc')).toBe(120);
    expect(eligibleSortPrice([{ sellingPrice: 10, sellable: false }], 'asc')).toBeNull();
  });

  it('drops unpublished products and ineligible variants before sorting and paging', () => {
    const catalog = [
      {
        productId: 'draft',
        status: 'draft',
        categoryId: 'hair',
        units: 50,
        price: 1,
      },
      {
        productId: 'published-late',
        status: 'published',
        categoryId: 'hair',
        units: 1,
        price: 40,
      },
      {
        productId: 'published-hot',
        status: 'published',
        categoryId: 'hair',
        units: 3,
        price: 10,
      },
      {
        productId: 'other-category',
        status: 'published',
        categoryId: 'skin',
        units: 9,
        price: 5,
      },
    ];
    const visible = catalog.filter((row) => row.status === 'published' && row.categoryId === 'hair');
    const byPopularity = [...visible].sort((left, right) =>
      comparePopularity(
        { productId: left.productId, units: left.units, lastSaleAt: daysAgo(1) },
        { productId: right.productId, units: right.units, lastSaleAt: daysAgo(1) },
      ),
    );
    const page = byPopularity.slice(0, 1);

    expect(page.map((row) => row.productId)).toEqual(['published-hot']);
    expect(visible.map((row) => row.productId)).not.toContain('draft');
    expect(visible.map((row) => row.productId)).not.toContain('other-category');
  });

  it('rejects an unknown sort and accepts the three public options', async () => {
    const invalid = await validate(plainToInstance(PublicProductQueryDto, { sortBy: 'views' }));
    expect(invalid.some((error) => error.property === 'sortBy')).toBe(true);

    for (const sortBy of ['popularity', 'price_asc', 'price_desc']) {
      const errors = await validate(plainToInstance(PublicProductQueryDto, { sortBy }));
      expect(errors.some((error) => error.property === 'sortBy')).toBe(false);
    }
  });

  it('leaves the admin product sort list unchanged', () => {
    expect(ADMIN_PRODUCT_LIST_SORT_FIELDS).not.toContain('popularity');
    expect(ADMIN_PRODUCT_LIST_SORT_FIELDS).not.toContain('price_asc');
    expect(ADMIN_PRODUCT_LIST_SORT_FIELDS).not.toContain('price_desc');
  });

  it('builds the sales aggregate from paid lines, finished returns, and a 7-day window', () => {
    const sql = popularitySalesSubquerySql();

    expect(sql).toContain("INTERVAL '7 days'");
    expect(sql).toContain('item.quantity - COALESCE(returned.accepted_quantity, 0)');
    expect(sql).toContain("'PAID'");
    expect(sql).toContain("'PARTIALLY_PAID'");
    expect(sql).toContain("'PARTIALLY_REFUNDED'");
    expect(sql).toContain("'CANCELLED'");
    expect(sql).toContain("'FAILED_DELIVERY'");
    expect(sql).toContain("'RTO'");
    expect(sql).toContain("'COMPLETED'");
    expect(sql).toContain("'REFUND_COMPLETED'");
    expect(sql).toContain('GROUP BY item.product_id');
  });

  it('uses min and max selling price of sellable variants', () => {
    const ascending = sellableVariantPriceSql('MIN', 'pv.out_of_stock = false', 'product.id IS NOT NULL');
    const descending = sellableVariantPriceSql('MAX', 'pv.out_of_stock = false', 'product.id IS NOT NULL');

    expect(ascending).toContain('MIN(pv.selling_price::numeric)');
    expect(descending).toContain('MAX(pv.selling_price::numeric)');
    expect(ascending).toContain('pv.out_of_stock = false');
    expect(ascending).not.toContain('mrp');
  });
});
