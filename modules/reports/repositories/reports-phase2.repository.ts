import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserEntity } from '@modules/users/entities/user.entity';
import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { REVENUE_EXCLUDED_STATUSES } from '@modules/dashboard/constants/dashboard.constants';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../constants/report.constants';
import { ReportQueryDto } from '../dto/report-query.dto';
import { ReportDateRange, ReportsRepository } from './reports.repository';

@Injectable()
export class ReportsPhase2Repository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly reportsRepository: ReportsRepository,
  ) {}

  async fetchProductPerformanceRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      productId: string;
      productRefId: string;
      productName: string;
      sku: string;
      unitsSold: number;
      ordersCount: number;
      revenue: number;
      stock: number;
      outOfStock: boolean;
    }>
  > {
    const qb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin(ProductEntity, 'product', 'product.id = item.productId')
      .select('product.id', 'productId')
      .addSelect('product.refId', 'productRefId')
      .addSelect('MAX(product.name)', 'productName')
      .addSelect('MAX(item.sku)', 'sku')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'unitsSold')
      .addSelect('COUNT(DISTINCT order.id)', 'ordersCount')
      .addSelect('COALESCE(SUM(item.totalPrice::numeric), 0)', 'revenue')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.paymentStatus IN (:...paidStatuses)', {
        paidStatuses: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .andWhere('order.orderStatus NOT IN (:...excludedStatuses)', {
        excludedStatuses: REVENUE_EXCLUDED_STATUSES,
      });

    this.applyProductFilters(qb, query);
    qb.groupBy('product.id').addGroupBy('product.refId');

    const direction = query.ranking === 'low' ? 'ASC' : 'DESC';
    qb.orderBy('revenue', direction).addOrderBy('unitsSold', direction);

    const rows = await qb.getRawMany();
    const productIds = rows.map((row) => String(row.productId));
    const stockMap = await this.loadStockByProductIds(productIds);

    return rows.map((row) => {
      const stockInfo = stockMap.get(String(row.productId)) ?? { stock: 0, outOfStock: false };
      return {
        productId: String(row.productId),
        productRefId: String(row.productRefId),
        productName: String(row.productName),
        sku: String(row.sku ?? ''),
        unitsSold: Number(row.unitsSold || 0),
        ordersCount: Number(row.ordersCount || 0),
        revenue: Number(row.revenue || 0),
        stock: stockInfo.stock,
        outOfStock: stockInfo.outOfStock,
      };
    });
  }

  async fetchInventoryRows(query: ReportQueryDto): Promise<
    Array<{
      productId: string;
      productRefId: string;
      productName: string;
      variantId: string;
      sku: string;
      stock: number;
      mrp: number;
      sellingPrice: number;
      valuation: number;
      outOfStock: boolean;
      stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
    }>
  > {
    const threshold = query.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const qb = this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin(ProductEntity, 'product', 'product.id = variant.productId')
      .select('product.id', 'productId')
      .addSelect('product.refId', 'productRefId')
      .addSelect('product.name', 'productName')
      .addSelect('variant.id', 'variantId')
      .addSelect('variant.sku', 'sku')
      .addSelect('variant.stock', 'stock')
      .addSelect('variant.mrp', 'mrp')
      .addSelect('variant.sellingPrice', 'sellingPrice')
      .addSelect('variant.outOfStock', 'outOfStock')
      .where('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED });

    if (query.brandRefId || query.categoryRefId) {
      qb.leftJoin('product.brand', 'brand').leftJoin('product.category', 'category');
      if (query.brandRefId) {
        qb.andWhere('brand.refId = :brandRefId', { brandRefId: query.brandRefId });
      }
      if (query.categoryRefId) {
        qb.andWhere('category.refId = :categoryRefId', { categoryRefId: query.categoryRefId });
      }
    }

    const rows = await qb.getRawMany();
    const mapped = rows.map((row) => {
      const stock = Number(row.stock || 0);
      const sellingPrice = Number(row.sellingPrice || 0);
      const outOfStock = Boolean(row.outOfStock);
      let stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' = 'in_stock';
      if (outOfStock || stock <= 0) {
        stockStatus = 'out_of_stock';
      } else if (stock <= threshold) {
        stockStatus = 'low_stock';
      }

      return {
        productId: String(row.productId),
        productRefId: String(row.productRefId),
        productName: String(row.productName),
        variantId: String(row.variantId),
        sku: String(row.sku),
        stock,
        mrp: Number(row.mrp || 0),
        sellingPrice,
        valuation: Math.round(stock * sellingPrice * 100) / 100,
        outOfStock,
        stockStatus,
      };
    });

    if (query.stockFilter === 'low') {
      return mapped.filter((row) => row.stockStatus === 'low_stock');
    }
    if (query.stockFilter === 'out_of_stock') {
      return mapped.filter((row) => row.stockStatus === 'out_of_stock');
    }
    if (query.stockFilter === 'in_stock') {
      return mapped.filter((row) => row.stockStatus === 'in_stock');
    }
    return mapped;
  }

  async fetchVendorPerformanceRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      vendorId: string;
      vendorRefId: string;
      vendorName: string;
      orders: number;
      revenue: number;
      delivered: number;
      cancelled: number;
      returned: number;
      activeProducts: number;
    }>
  > {
    const params: unknown[] = [range.start, range.end];
    let vendorFilter = '';
    if (query.vendorRefId) {
      params.push(query.vendorRefId);
      vendorFilter = `AND v.ref_id = $${params.length}`;
    }

    const rows = (await this.dataSource.query(
      `
      SELECT
        v.id AS "vendorId",
        v.ref_id AS "vendorRefId",
        v.company_name AS "vendorName",
        COUNT(DISTINCT o.id)::int AS orders,
        COALESCE(SUM(oi.total_price::numeric), 0)::float AS revenue,
        COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'DELIVERED')::int AS delivered,
        COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'CANCELLED')::int AS cancelled,
        COUNT(DISTINCT o.id) FILTER (WHERE o.order_status IN ('RTO', 'FAILED_DELIVERY'))::int AS returned,
        (
          SELECT COUNT(*)::int
          FROM products p2
          WHERE p2.vendor_id = v.id
            AND p2.deleted_at IS NULL
            AND p2.status = 'published'
        ) AS "activeProducts"
      FROM vendors v
      LEFT JOIN products p ON p.vendor_id = v.id AND p.deleted_at IS NULL
      LEFT JOIN order_items oi ON oi.product_id = p.id
      LEFT JOIN orders o
        ON o.id = oi.order_id
       AND o.deleted_at IS NULL
       AND COALESCE(o.placed_at, o.created_at) BETWEEN $1 AND $2
      WHERE v.deleted_at IS NULL
        ${vendorFilter}
      GROUP BY v.id, v.ref_id, v.company_name
      HAVING COUNT(DISTINCT o.id) > 0 OR (
        SELECT COUNT(*) FROM products p3
        WHERE p3.vendor_id = v.id AND p3.deleted_at IS NULL AND p3.status = 'published'
      ) > 0
      ORDER BY revenue DESC
      `,
      params,
    )) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      vendorId: String(row.vendorId),
      vendorRefId: String(row.vendorRefId),
      vendorName: String(row.vendorName),
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
      delivered: Number(row.delivered || 0),
      cancelled: Number(row.cancelled || 0),
      returned: Number(row.returned || 0),
      activeProducts: Number(row.activeProducts || 0),
    }));
  }

  async fetchCustomerRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      userId: string;
      userRefId: string;
      name: string;
      email: string | null;
      phone: string | null;
      isGuest: boolean;
      totalOrders: number;
      totalSpend: number;
      lastOrderAt: Date | null;
    }>
  > {
    const qb = this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .innerJoin(OrderEntity, 'order', 'order.userId = user.id')
      .select('user.id', 'userId')
      .addSelect('user.refId', 'userRefId')
      .addSelect(`TRIM(CONCAT(COALESCE(user.firstName, ''), ' ', COALESCE(user.lastName, '')))`, 'name')
      .addSelect('user.email', 'email')
      .addSelect('user.mobileNumber', 'phone')
      .addSelect('user.isGuest', 'isGuest')
      .addSelect('COUNT(order.id)', 'totalOrders')
      .addSelect('COALESCE(SUM(order.grandTotal::numeric), 0)', 'totalSpend')
      .addSelect('MAX(COALESCE(order.placedAt, order.createdAt))', 'lastOrderAt')
      .where('user.deletedAt IS NULL')
      .andWhere('order.deletedAt IS NULL')
      .andWhere('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('user.id')
      .addGroupBy('user.refId')
      .addGroupBy('user.firstName')
      .addGroupBy('user.lastName')
      .addGroupBy('user.email')
      .addGroupBy('user.mobileNumber')
      .addGroupBy('user.isGuest')
      .orderBy('totalSpend', 'DESC');

    if (query.type === 'consultation') {
      return [];
    }

    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      userId: String(row.userId),
      userRefId: String(row.userRefId),
      name: String(row.name),
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      isGuest: Boolean(row.isGuest),
      totalOrders: Number(row.totalOrders || 0),
      totalSpend: Number(row.totalSpend || 0),
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt) : null,
    }));
  }

  async fetchCustomerSummaryMetrics(range: ReportDateRange): Promise<{
    newCustomers: number;
    returningCustomers: number;
    totalRegistrations: number;
    activeCustomers: number;
    totalOrders: number;
    totalSpend: number;
  }> {
    const [newCustomersRow, returningRow, registrationsRow, activeRow] = await Promise.all([
      this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .where('user.deletedAt IS NULL')
        .andWhere('user.isGuest = false')
        .andWhere('user.createdAt BETWEEN :start AND :end', range)
        .getCount(),
      this.dataSource.query(
        `
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT o.user_id
          FROM orders o
          WHERE o.deleted_at IS NULL
            AND COALESCE(o.placed_at, o.created_at) BETWEEN $1 AND $2
          GROUP BY o.user_id
          HAVING COUNT(*) > 1
             OR MIN(COALESCE(o.placed_at, o.created_at)) < $1
        ) returning_users
        `,
        [range.start, range.end],
      ),
      this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .where('user.deletedAt IS NULL')
        .andWhere('user.createdAt BETWEEN :start AND :end', range)
        .getCount(),
      this.dataSource
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .select('COUNT(DISTINCT order.userId)', 'activeCustomers')
        .addSelect('COUNT(order.id)', 'totalOrders')
        .addSelect('COALESCE(SUM(order.grandTotal::numeric), 0)', 'totalSpend')
        .where('order.deletedAt IS NULL')
        .andWhere('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', range)
        .getRawOne(),
    ]);

    return {
      newCustomers: newCustomersRow,
      returningCustomers: Number(returningRow?.[0]?.count || 0),
      totalRegistrations: registrationsRow,
      activeCustomers: Number(activeRow?.activeCustomers || 0),
      totalOrders: Number(activeRow?.totalOrders || 0),
      totalSpend: Number(activeRow?.totalSpend || 0),
    };
  }

  async fetchPaymentRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      paymentMethod: string;
      successful: number;
      failed: number;
      pending: number;
      refunded: number;
      successfulAmount: number;
      failedAmount: number;
      pendingAmount: number;
      refundedAmount: number;
    }>
  > {
    const qb = this.reportsRepository.buildOrdersBaseQuery(query, range);
    const rows = await qb
      .select('o.paymentMethod', 'paymentMethod')
      .addSelect(
        `SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.PAID}', '${OrderPaymentStatus.PARTIALLY_PAID}') THEN 1 ELSE 0 END)::int`,
        'successful',
      )
      .addSelect(
        `SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.FAILED}' THEN 1 ELSE 0 END)::int`,
        'failed',
      )
      .addSelect(
        `SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.PENDING}' THEN 1 ELSE 0 END)::int`,
        'pending',
      )
      .addSelect(
        `SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.REFUND_PENDING}', '${OrderPaymentStatus.PARTIALLY_REFUNDED}', '${OrderPaymentStatus.REFUNDED}') THEN 1 ELSE 0 END)::int`,
        'refunded',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.PAID}', '${OrderPaymentStatus.PARTIALLY_PAID}') THEN o.grandTotal::numeric ELSE 0 END), 0)`,
        'successfulAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.FAILED}' THEN o.grandTotal::numeric ELSE 0 END), 0)`,
        'failedAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.PENDING}' THEN o.grandTotal::numeric ELSE 0 END), 0)`,
        'pendingAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.REFUND_PENDING}', '${OrderPaymentStatus.PARTIALLY_REFUNDED}', '${OrderPaymentStatus.REFUNDED}') THEN o.grandTotal::numeric ELSE 0 END), 0)`,
        'refundedAmount',
      )
      .groupBy('o.paymentMethod')
      .orderBy('successfulAmount', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      paymentMethod: String(row.paymentMethod),
      successful: Number(row.successful || 0),
      failed: Number(row.failed || 0),
      pending: Number(row.pending || 0),
      refunded: Number(row.refunded || 0),
      successfulAmount: Number(row.successfulAmount || 0),
      failedAmount: Number(row.failedAmount || 0),
      pendingAmount: Number(row.pendingAmount || 0),
      refundedAmount: Number(row.refundedAmount || 0),
    }));
  }

  async fetchReturnRefundRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      date: string;
      orderNumber: string;
      type: 'return' | 'refund';
      amount: number;
      reason: string | null;
      status: string;
    }>
  > {
    const returnRows = await this.reportsRepository
      .buildOrdersBaseQuery(query, range)
      .andWhere('o.orderStatus IN (:...returnStatuses)', {
        returnStatuses: [OrderStatus.RTO, OrderStatus.FAILED_DELIVERY, OrderStatus.CANCELLED],
      })
      .select(`TO_CHAR(COALESCE(o.placedAt, o.createdAt), 'DD-Mon-YYYY')`, 'date')
      .addSelect('o.orderNumber', 'orderNumber')
      .addSelect('o.grandTotal', 'amount')
      .addSelect('o.cancelReason', 'reason')
      .addSelect('o.orderStatus', 'status')
      .orderBy('COALESCE(o.placedAt, o.createdAt)', 'DESC')
      .getRawMany();

    const refundRows = (await this.dataSource.query(
      `
      SELECT
        TO_CHAR(COALESCE(o.placed_at, o.created_at), 'DD-Mon-YYYY') AS date,
        o.order_number AS "orderNumber",
        gr.amount::float AS amount,
        gr.description AS reason,
        gr.status AS status
      FROM gokwik_refunds gr
      INNER JOIN orders o ON o.id = gr.order_id
      WHERE o.deleted_at IS NULL
        AND COALESCE(o.placed_at, o.created_at) BETWEEN $1 AND $2
      ORDER BY COALESCE(o.placed_at, o.created_at) DESC
      `,
      [range.start, range.end],
    )) as Array<Record<string, unknown>>;

    const mappedReturns = returnRows.map((row) => ({
      date: String(row.date),
      orderNumber: String(row.orderNumber),
      type: 'return' as const,
      amount: Number(row.amount || 0),
      reason: row.reason ? String(row.reason) : null,
      status: String(row.status),
    }));

    const mappedRefunds = refundRows.map((row) => ({
      date: String(row.date),
      orderNumber: String(row.orderNumber),
      type: 'refund' as const,
      amount: Number(row.amount || 0),
      reason: row.reason ? String(row.reason) : null,
      status: String(row.status),
    }));

    return [...mappedReturns, ...mappedRefunds].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }

  async fetchCouponRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      couponId: string;
      couponCode: string;
      couponTitle: string;
      usages: number;
      discountAmount: number;
      revenue: number;
    }>
  > {
    const rows = await this.dataSource
      .getRepository(CouponUsageEntity)
      .createQueryBuilder('usage')
      .leftJoin('usage.coupon', 'coupon')
      .leftJoin(OrderEntity, 'order', 'order.id = usage.orderId')
      .select('usage.couponId', 'couponId')
      .addSelect('MAX(coupon.code)', 'couponCode')
      .addSelect('MAX(coupon.title)', 'couponTitle')
      .addSelect('COUNT(*)', 'usages')
      .addSelect('COALESCE(SUM(usage.discountAmount::numeric), 0)', 'discountAmount')
      .addSelect('COALESCE(SUM(order.grandTotal::numeric), 0)', 'revenue')
      .where('usage.usedAt BETWEEN :start AND :end', range)
      .groupBy('usage.couponId')
      .orderBy('revenue', 'DESC')
      .getRawMany();

    return rows.map((row) => ({
      couponId: String(row.couponId),
      couponCode: String(row.couponCode ?? ''),
      couponTitle: String(row.couponTitle ?? ''),
      usages: Number(row.usages || 0),
      discountAmount: Number(row.discountAmount || 0),
      revenue: Number(row.revenue || 0),
    }));
  }

  async countTotalOrdersInRange(range: ReportDateRange): Promise<number> {
    return this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .where('order.deletedAt IS NULL')
      .andWhere('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', range)
      .getCount();
  }

  async countOutOfStockProducts(): Promise<number> {
    const row = await this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .innerJoin(ProductEntity, 'product', 'product.id = variant.productId')
      .select('COUNT(DISTINCT product.id)', 'count')
      .where('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .andWhere('product.deletedAt IS NULL')
      .andWhere('product.status = :productStatus', { productStatus: ProductStatus.PUBLISHED })
      .andWhere('(variant.outOfStock = true OR variant.stock <= 0)')
      .getRawOne();

    return Number(row?.count || 0);
  }

  private async loadStockByProductIds(
    productIds: string[],
  ): Promise<Map<string, { stock: number; outOfStock: boolean }>> {
    if (!productIds.length) return new Map();

    const rows = await this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .addSelect('COALESCE(SUM(variant.stock), 0)', 'stock')
      .addSelect('BOOL_OR(variant.outOfStock)', 'outOfStock')
      .where('variant.productId IN (:...productIds)', { productIds })
      .andWhere('variant.deletedAt IS NULL')
      .andWhere('variant.status = :variantStatus', { variantStatus: VariantStatus.ACTIVE })
      .groupBy('variant.productId')
      .getRawMany();

    return new Map(
      rows.map((row) => [
        String(row.productId),
        { stock: Number(row.stock || 0), outOfStock: Boolean(row.outOfStock) },
      ]),
    );
  }

  private applyProductFilters(qb: any, query: ReportQueryDto): void {
    if (query.brandRefId || query.categoryRefId) {
      qb.leftJoin('product.brand', 'brand').leftJoin('product.category', 'category');
      if (query.brandRefId) {
        qb.andWhere('brand.refId = :brandRefId', { brandRefId: query.brandRefId });
      }
      if (query.categoryRefId) {
        qb.andWhere('category.refId = :categoryRefId', { categoryRefId: query.categoryRefId });
      }
    }
  }
}
