import { Injectable } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ReportQueryDto } from '../dto/report-query.dto';

export type ReportDateRange = { start: Date; end: Date };

@Injectable()
export class ReportsRepository {
  constructor(private readonly dataSource: DataSource) {}

  buildOrdersBaseQuery(query: ReportQueryDto, range: ReportDateRange): SelectQueryBuilder<OrderEntity> {
    const qb = this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('o')
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
      .addSelect('COALESCE(SUM(o.subtotal::numeric), 0)::float', 'grossSales')
      .addSelect('COALESCE(SUM(o.discountAmount::numeric), 0)::float', 'discounts')
      .addSelect('COALESCE(SUM(o.shippingAmount::numeric), 0)::float', 'shipping')
      .addSelect('COALESCE(SUM(o.grandTotal::numeric), 0)::float', 'netSales')
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
      .addSelect('COALESCE(SUM(gr.amount::numeric), 0)::float', 'amount')
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
}

