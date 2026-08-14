import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { ProductStatus } from '@modules/product/enums/product-status.enum';
import { VariantStatus } from '@modules/product/enums/variant-status.enum';
import { UserEntity } from '@modules/users/entities/user.entity';
import { REVENUE_EXCLUDED_STATUSES } from '@modules/dashboard/constants/dashboard.constants';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../constants/report.constants';
import { ReportQueryDto } from '../dto/report-query.dto';

export type ReportDateRange = { start: Date; end: Date };

@Injectable()
export class ReportsRepository {
  constructor(private readonly dataSource: DataSource) {}

  buildOrdersBaseQuery(query: ReportQueryDto, range: ReportDateRange): SelectQueryBuilder<OrderEntity> {
    const qb = this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('o')
      .innerJoin(UserEntity, 'u', 'u.id = o.userId AND u.deletedAt IS NULL')
      .where('o.deletedAt IS NULL')
      .andWhere('COALESCE(o.placedAt, o.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      });

    if (query.paymentMethod) {
      qb.andWhere('o.paymentMethod = :paymentMethod', { paymentMethod: query.paymentMethod });
    }

    if (query.orderStatus) {
      qb.andWhere('o.orderStatus = :orderStatus', { orderStatus: query.orderStatus });
    }

    if (query.brandRefId || query.categoryRefId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM order_items oi
          INNER JOIN products p ON p.id = oi.product_id
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE oi.order_id = o.id
            ${query.brandRefId ? 'AND b.ref_id = :brandRefId' : ''}
            ${query.categoryRefId ? 'AND c.ref_id = :categoryRefId' : ''}
        )`,
        {
          brandRefId: query.brandRefId,
          categoryRefId: query.categoryRefId,
        },
      );
    }

    return qb;
  }

  async fetchSalesSummaryRows(query: ReportQueryDto, range: ReportDateRange): Promise<
    Array<{
      date: string;
      orders: number;
      grossSales: number;
      discounts: number;
      shipping: number;
      netSales: number;
    }>
  > {
    const qb = this.buildOrdersBaseQuery(query, range)
      .andWhere('o.paymentStatus IN (:...paidStatuses)', {
        paidStatuses: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .andWhere('o.orderStatus NOT IN (:...excludedStatuses)', {
        excludedStatuses: [OrderStatus.CANCELLED, OrderStatus.FAILED_DELIVERY],
      })
      .select(`TO_CHAR(DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt)), 'DD-Mon-YYYY')`, 'date')
      .addSelect('COUNT(o.id)::int', 'orders')
      .addSelect('COALESCE(SUM(o.subtotal), 0)', 'grossSales')
      .addSelect('COALESCE(SUM(o.discountAmount), 0)', 'discounts')
      .addSelect('COALESCE(SUM(o.shippingAmount), 0)', 'shipping')
      .addSelect('COALESCE(SUM(o.grandTotal), 0)', 'netSales')
      .groupBy(`DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt))`)
      .orderBy(`DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt))`, 'DESC');

    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      date: String(row.date),
      orders: Number(row.orders || 0),
      grossSales: Number(row.grossSales || 0),
      discounts: Number(row.discounts || 0),
      shipping: Number(row.shipping || 0),
      netSales: Number(row.netSales || 0),
    }));
  }

  async fetchRefundsByDay(query: ReportQueryDto, range: ReportDateRange): Promise<Map<string, number>> {
    const qb = this.dataSource
      .createQueryBuilder()
      .from('gokwik_refunds', 'gr')
      .innerJoin('orders', 'o', 'o.id = gr.order_id')
      .innerJoin('users', 'u', 'u.id = o.user_id AND u.deleted_at IS NULL')
      .where('o.deleted_at IS NULL')
      .andWhere('COALESCE(o.placed_at, o.created_at) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      });

    if (query.paymentMethod) {
      qb.andWhere('o.payment_method = :paymentMethod', { paymentMethod: query.paymentMethod });
    }
    if (query.orderStatus) {
      qb.andWhere('o.order_status = :orderStatus', { orderStatus: query.orderStatus });
    }
    if (query.brandRefId || query.categoryRefId) {
      qb.andWhere(
        `EXISTS (
          SELECT 1
          FROM order_items oi
          INNER JOIN products p ON p.id = oi.product_id
          LEFT JOIN brands b ON b.id = p.brand_id
          LEFT JOIN categories c ON c.id = p.category_id
          WHERE oi.order_id = o.id
            ${query.brandRefId ? 'AND b.ref_id = :brandRefId' : ''}
            ${query.categoryRefId ? 'AND c.ref_id = :categoryRefId' : ''}
        )`,
        {
          brandRefId: query.brandRefId,
          categoryRefId: query.categoryRefId,
        },
      );
    }

    const rows = (await qb
      .select(`TO_CHAR(DATE_TRUNC('day', COALESCE(o.placed_at, o.created_at)), 'DD-Mon-YYYY')`, 'date')
      .addSelect('COALESCE(SUM(gr.amount), 0)', 'amount')
      .groupBy(`DATE_TRUNC('day', COALESCE(o.placed_at, o.created_at))`)
      .getRawMany()) as Array<{ date: string; amount: number }>;

    const map = new Map<string, number>();
    rows.forEach((row) => map.set(row.date, Number(row.amount || 0)));
    return map;
  }

  async fetchOrderStatusRows(query: ReportQueryDto, range: ReportDateRange): Promise<
    Array<{
      date: string;
      totalOrders: number;
      pending: number;
      confirmed: number;
      shipped: number;
      delivered: number;
      cancelled: number;
      returned: number;
      refunded: number;
    }>
  > {
    const qb = this.buildOrdersBaseQuery(query, range)
      .select(`TO_CHAR(DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt)), 'DD-Mon-YYYY')`, 'date')
      .addSelect('COUNT(o.id)::int', 'totalOrders')
      .addSelect(`SUM(CASE WHEN o.orderStatus = '${OrderStatus.PENDING}' THEN 1 ELSE 0 END)::int`, 'pending')
      .addSelect(
        `SUM(CASE WHEN o.orderStatus = '${OrderStatus.CONFIRMED}' THEN 1 ELSE 0 END)::int`,
        'confirmed',
      )
      .addSelect(
        `SUM(CASE WHEN o.orderStatus IN ('${OrderStatus.SHIPPED}', '${OrderStatus.OUT_FOR_DELIVERY}') THEN 1 ELSE 0 END)::int`,
        'shipped',
      )
      .addSelect(`SUM(CASE WHEN o.orderStatus = '${OrderStatus.DELIVERED}' THEN 1 ELSE 0 END)::int`, 'delivered')
      .addSelect(`SUM(CASE WHEN o.orderStatus = '${OrderStatus.CANCELLED}' THEN 1 ELSE 0 END)::int`, 'cancelled')
      .addSelect(
        `SUM(CASE WHEN o.orderStatus IN ('${OrderStatus.RTO}', '${OrderStatus.FAILED_DELIVERY}') THEN 1 ELSE 0 END)::int`,
        'returned',
      )
      .addSelect(
        `SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.REFUND_PENDING}', '${OrderPaymentStatus.PARTIALLY_REFUNDED}', '${OrderPaymentStatus.REFUNDED}') THEN 1 ELSE 0 END)::int`,
        'refunded',
      )
      .groupBy(`DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt))`)
      .orderBy(`DATE_TRUNC('day', COALESCE(o.placedAt, o.createdAt))`, 'DESC');

    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      date: String(row.date),
      totalOrders: Number(row.totalOrders || 0),
      pending: Number(row.pending || 0),
      confirmed: Number(row.confirmed || 0),
      shipped: Number(row.shipped || 0),
      delivered: Number(row.delivered || 0),
      cancelled: Number(row.cancelled || 0),
      returned: Number(row.returned || 0),
      refunded: Number(row.refunded || 0),
    }));
  }

  async fetchOrderDetailRows(
    query: ReportQueryDto,
    range: ReportDateRange,
  ): Promise<
    Array<{
      orderId: string;
      orderNumber: string;
      date: string;
      placedAt: Date;
      userId: string;
      userRefId: string;
      customerName: string;
      email: string | null;
      phone: string | null;
      isGuest: boolean;
      orderStatus: string;
      paymentStatus: string;
      paymentMethod: string;
      orderSource: string;
      itemsCount: number;
      subtotal: number;
      discountAmount: number;
      shippingAmount: number;
      grandTotal: number;
      city: string;
      state: string;
    }>
  > {
    const qb = this.buildOrdersBaseQuery(query, range)
      .leftJoin(OrderItemEntity, 'oi', 'oi.orderId = o.id')
      .select('o.id', 'orderId')
      .addSelect('o.orderNumber', 'orderNumber')
      .addSelect(`TO_CHAR(COALESCE(o.placedAt, o.createdAt), 'DD-Mon-YYYY')`, 'date')
      .addSelect('COALESCE(o.placedAt, o.createdAt)', 'placedAt')
      .addSelect('u.id', 'userId')
      .addSelect('u.refId', 'userRefId')
      .addSelect(
        `COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.firstName, ''), ' ', COALESCE(u.lastName, ''))), ''),
          o.recipientName,
          u.mobileNumber,
          o.phoneNumber,
          u.email,
          'Customer'
        )`,
        'customerName',
      )
      .addSelect('u.email', 'email')
      .addSelect('COALESCE(u.mobileNumber, o.phoneNumber)', 'phone')
      .addSelect('u.isGuest', 'isGuest')
      .addSelect('o.orderStatus', 'orderStatus')
      .addSelect('o.paymentStatus', 'paymentStatus')
      .addSelect('o.paymentMethod', 'paymentMethod')
      .addSelect('o.orderSource', 'orderSource')
      .addSelect('COUNT(oi.id)::int', 'itemsCount')
      .addSelect('o.subtotal', 'subtotal')
      .addSelect('o.discountAmount', 'discountAmount')
      .addSelect('o.shippingAmount', 'shippingAmount')
      .addSelect('o.grandTotal', 'grandTotal')
      .addSelect('o.city', 'city')
      .addSelect('o.state', 'state')
      .groupBy('o.id')
      .addGroupBy('o.orderNumber')
      .addGroupBy('o.placedAt')
      .addGroupBy('o.createdAt')
      .addGroupBy('u.id')
      .addGroupBy('u.refId')
      .addGroupBy('u.firstName')
      .addGroupBy('u.lastName')
      .addGroupBy('u.email')
      .addGroupBy('u.mobileNumber')
      .addGroupBy('u.isGuest')
      .addGroupBy('o.recipientName')
      .addGroupBy('o.phoneNumber')
      .addGroupBy('o.orderStatus')
      .addGroupBy('o.paymentStatus')
      .addGroupBy('o.paymentMethod')
      .addGroupBy('o.orderSource')
      .addGroupBy('o.subtotal')
      .addGroupBy('o.discountAmount')
      .addGroupBy('o.shippingAmount')
      .addGroupBy('o.grandTotal')
      .addGroupBy('o.city')
      .addGroupBy('o.state')
      .orderBy('COALESCE(o.placedAt, o.createdAt)', 'DESC');

    const rows = await qb.getRawMany();
    return rows.map((row) => ({
      orderId: String(row.orderId),
      orderNumber: String(row.orderNumber),
      date: String(row.date),
      placedAt: new Date(row.placedAt),
      userId: String(row.userId),
      userRefId: String(row.userRefId),
      customerName: String(row.customerName ?? 'Customer'),
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      isGuest: Boolean(row.isGuest),
      orderStatus: String(row.orderStatus),
      paymentStatus: String(row.paymentStatus),
      paymentMethod: String(row.paymentMethod),
      orderSource: String(row.orderSource),
      itemsCount: Number(row.itemsCount || 0),
      subtotal: Number(row.subtotal || 0),
      discountAmount: Number(row.discountAmount || 0),
      shippingAmount: Number(row.shippingAmount || 0),
      grandTotal: Number(row.grandTotal || 0),
      city: String(row.city ?? ''),
      state: String(row.state ?? ''),
    }));
  }

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
      .innerJoin('item.order', 'ord')
      .innerJoin(UserEntity, 'u', 'u.id = ord.userId AND u.deletedAt IS NULL')
      .innerJoin(ProductEntity, 'product', 'product.id = item.productId')
      .select('product.id', 'productId')
      .addSelect('product.refId', 'productRefId')
      .addSelect('MAX(product.name)', 'productName')
      .addSelect('MAX(item.sku)', 'sku')
      .addSelect('COALESCE(SUM(item.quantity), 0)', 'unitsSold')
      .addSelect('COUNT(DISTINCT ord.id)', 'ordersCount')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .where('COALESCE(ord.placedAt, ord.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('ord.paymentStatus IN (:...paidStatuses)', {
        paidStatuses: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .andWhere('ord.orderStatus NOT IN (:...excludedStatuses)', {
        excludedStatuses: REVENUE_EXCLUDED_STATUSES,
      });

    this.applyProductFilters(qb, query);
    qb.groupBy('product.id').addGroupBy('product.refId');

    const direction = query.ranking === 'low' ? 'ASC' : 'DESC';
    qb.orderBy('"revenue"', direction).addOrderBy('"unitsSold"', direction);

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
    if (query.type === 'consultation') {
      return [];
    }

    const rows = (await this.dataSource.query(
      `
      SELECT
        u.id AS "userId",
        u.ref_id AS "userRefId",
        COALESCE(
          NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''),
          MAX(o.recipient_name),
          u.mobile_number,
          MAX(o.phone_number),
          u.email,
          'Customer'
        ) AS name,
        u.email AS email,
        COALESCE(u.mobile_number, MAX(o.phone_number)) AS phone,
        u.is_guest AS "isGuest",
        COUNT(o.id)::int AS "totalOrders",
        COALESCE(SUM(o.grand_total), 0)::float AS "totalSpend",
        MAX(COALESCE(o.placed_at, o.created_at)) AS "lastOrderAt"
      FROM users u
      INNER JOIN orders o ON o.user_id = u.id
      WHERE u.deleted_at IS NULL
        AND o.deleted_at IS NULL
        AND COALESCE(o.placed_at, o.created_at) BETWEEN $1 AND $2
      GROUP BY u.id, u.ref_id, u.first_name, u.last_name, u.email, u.mobile_number, u.is_guest
      ORDER BY "totalSpend" DESC
      `,
      [range.start, range.end],
    )) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      userId: String(row.userId),
      userRefId: String(row.userRefId),
      name: String(row.name ?? 'Customer'),
      email: row.email ? String(row.email) : null,
      phone: row.phone ? String(row.phone) : null,
      isGuest: Boolean(row.isGuest),
      totalOrders: Number(row.totalOrders || 0),
      totalSpend: Number(row.totalSpend || 0),
      lastOrderAt: row.lastOrderAt ? new Date(String(row.lastOrderAt)) : null,
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
        .createQueryBuilder('u')
        .where('u.deletedAt IS NULL')
        .andWhere('u.isGuest = false')
        .andWhere('u.createdAt BETWEEN :start AND :end', range)
        .getCount(),
      this.dataSource.query(
        `
        SELECT COUNT(*)::int AS count
        FROM (
          SELECT o.user_id
          FROM orders o
          INNER JOIN users u ON u.id = o.user_id AND u.deleted_at IS NULL
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
        .createQueryBuilder('u')
        .where('u.deletedAt IS NULL')
        .andWhere('u.isGuest = false')
        .andWhere('u.createdAt BETWEEN :start AND :end', range)
        .getCount(),
      this.dataSource
        .getRepository(OrderEntity)
        .createQueryBuilder('ord')
        .innerJoin(UserEntity, 'u', 'u.id = ord.userId AND u.deletedAt IS NULL')
        .select('COUNT(DISTINCT ord.userId)', 'activeCustomers')
        .addSelect('COUNT(ord.id)', 'totalOrders')
        .addSelect('COALESCE(SUM(ord.grandTotal), 0)', 'totalSpend')
        .where('ord.deletedAt IS NULL')
        .andWhere('COALESCE(ord.placedAt, ord.createdAt) BETWEEN :start AND :end', range)
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
    const qb = this.buildOrdersBaseQuery(query, range);
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
        `COALESCE(SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.PAID}', '${OrderPaymentStatus.PARTIALLY_PAID}') THEN o.grandTotal ELSE 0 END), 0)`,
        'successfulAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.FAILED}' THEN o.grandTotal ELSE 0 END), 0)`,
        'failedAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus = '${OrderPaymentStatus.PENDING}' THEN o.grandTotal ELSE 0 END), 0)`,
        'pendingAmount',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN o.paymentStatus IN ('${OrderPaymentStatus.REFUND_PENDING}', '${OrderPaymentStatus.PARTIALLY_REFUNDED}', '${OrderPaymentStatus.REFUNDED}') THEN o.grandTotal ELSE 0 END), 0)`,
        'refundedAmount',
      )
      .groupBy('o.paymentMethod')
      .orderBy('"successfulAmount"', 'DESC')
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
    const returnRows = await this.buildOrdersBaseQuery(query, range)
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
      .leftJoin(OrderEntity, 'ord', 'ord.id = usage.orderId')
      .select('usage.couponId', 'couponId')
      .addSelect('MAX(coupon.code)', 'couponCode')
      .addSelect('MAX(coupon.title)', 'couponTitle')
      .addSelect('COUNT(*)', 'usages')
      .addSelect('COALESCE(SUM(usage.discountAmount), 0)', 'discountAmount')
      .addSelect('COALESCE(SUM(ord.grandTotal), 0)', 'revenue')
      .where('usage.usedAt BETWEEN :start AND :end', range)
      .groupBy('usage.couponId')
      .orderBy('"revenue"', 'DESC')
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
      .createQueryBuilder('ord')
      .where('ord.deletedAt IS NULL')
      .andWhere('COALESCE(ord.placedAt, ord.createdAt) BETWEEN :start AND :end', range)
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

  private applyProductFilters(qb: SelectQueryBuilder<OrderItemEntity>, query: ReportQueryDto): void {
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
