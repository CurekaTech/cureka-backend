import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
} from '@packages/common';
import {
  changePercentage,
  previousPeriodRange,
  round2,
} from '@modules/dashboard/utils/dashboard-format.util';
import { ReportQueryDto } from '../dto/report-query.dto';
import {
  IConsultationReportResponse,
  ICouponReportResponse,
  ICustomerReportResponse,
  IInventoryStockReportResponse,
  IOrderReportResponse,
  IOrderReportRow,
  IPaymentReportResponse,
  IProductPerformanceReportResponse,
  IReportKpi,
  IReturnRefundReportResponse,
  ISalesRevenueReportResponse,
  ISalesRevenueRow,
  IVendorPerformanceReportResponse,
} from '../reports.interface';
import { ReportsRepository } from '../repositories/reports.repository';
import {
  buildEmptyPaginatedResult,
  buildReportKpi,
  paginateRows,
  resolveReportRange,
} from '../utils/report-base.util';

@Injectable()
export class ReportsService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async getSalesRevenue(query: ReportQueryDto): Promise<ISalesRevenueReportResponse> {
    if (query.type === 'consultation') {
      return this.buildEmptySalesResponse(query);
    }

    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [currentRows, previousRows] = await Promise.all([
      this.reportsRepository.fetchSalesSummaryRows(query, range),
      this.reportsRepository.fetchSalesSummaryRows(query, prevRange),
    ]);

    const refundMap = await this.reportsRepository.fetchRefundsByDay(query, range);
    const rowsWithRefunds: ISalesRevenueRow[] = currentRows.map((row) => {
      const refunds = refundMap.get(row.date) ?? 0;
      return {
        date: row.date,
        type: 'product',
        orders: row.orders,
        grossSales: round2(row.grossSales),
        discounts: round2(row.discounts),
        tax: 0,
        shipping: round2(row.shipping),
        refunds: round2(refunds),
        netSales: round2(row.netSales),
        aov: row.orders > 0 ? round2(row.netSales / row.orders) : 0,
      };
    });

    const sortedRows = this.sortSalesRows(rowsWithRefunds, query);
    const paginationOptions = buildPaginationOptions(query);
    const total = sortedRows.length;
    const start = (paginationOptions.page - 1) * paginationOptions.limit;
    const pagedRows = sortedRows.slice(start, start + paginationOptions.limit);

    return {
      range: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      summary: this.buildSalesSummary(rowsWithRefunds, previousRows),
      rows: buildPaginatedResult<ISalesRevenueRow>(pagedRows, total, paginationOptions),
    };
  }

  async getSalesRevenueExportRows(query: ReportQueryDto): Promise<ISalesRevenueRow[]> {
    const range = resolveReportRange(query);
    const rows = await this.reportsRepository.fetchSalesSummaryRows(query, range);
    const refundMap = await this.reportsRepository.fetchRefundsByDay(query, range);

    return rows.map((row) => {
      const refunds = refundMap.get(row.date) ?? 0;
      return {
        date: row.date,
        type: 'product',
        orders: row.orders,
        grossSales: round2(row.grossSales),
        discounts: round2(row.discounts),
        tax: 0,
        shipping: round2(row.shipping),
        refunds: round2(refunds),
        netSales: round2(row.netSales),
        aov: row.orders > 0 ? round2(row.netSales / row.orders) : 0,
      };
    });
  }

  async getOrders(query: ReportQueryDto): Promise<IOrderReportResponse> {
    if (query.type === 'consultation') {
      return this.buildEmptyOrdersResponse(query);
    }

    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows] = await Promise.all([
      this.reportsRepository.fetchOrderStatusRows(query, range),
      this.reportsRepository.fetchOrderStatusRows(query, prevRange),
    ]);

    const sortedRows = this.sortOrderRows(rows, query);
    const paginationOptions = buildPaginationOptions(query);
    const total = sortedRows.length;
    const start = (paginationOptions.page - 1) * paginationOptions.limit;
    const pagedRows = sortedRows.slice(start, start + paginationOptions.limit);

    return {
      range: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      summary: this.buildOrdersSummary(rows, prevRows),
      rows: buildPaginatedResult(pagedRows, total, paginationOptions),
    };
  }

  async getOrdersExportRows(query: ReportQueryDto): Promise<IOrderReportRow[]> {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchOrderStatusRows(query, range);
  }

  async getProductPerformance(query: ReportQueryDto): Promise<IProductPerformanceReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows, outOfStockProducts] = await Promise.all([
      this.reportsRepository.fetchProductPerformanceRows(query, range),
      this.reportsRepository.fetchProductPerformanceRows(query, prevRange),
      this.reportsRepository.countOutOfStockProducts(),
    ]);

    const current = this.summarizeProductRows(rows);
    const previous = this.summarizeProductRows(prevRows);

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        totalProductsSold: buildReportKpi(current.productsSold, previous.productsSold),
        totalUnitsSold: buildReportKpi(current.unitsSold, previous.unitsSold),
        totalRevenue: buildReportKpi(current.revenue, previous.revenue),
        outOfStockProducts: buildReportKpi(outOfStockProducts, outOfStockProducts),
      },
      rows: paginateRows(rows, query),
    };
  }

  async getInventoryStock(query: ReportQueryDto): Promise<IInventoryStockReportResponse> {
    const rows = await this.reportsRepository.fetchInventoryRows(query);
    const summary = {
      totalSkus: rows.length,
      inStockSkus: rows.filter((row) => row.stockStatus === 'in_stock').length,
      lowStockSkus: rows.filter((row) => row.stockStatus === 'low_stock').length,
      outOfStockSkus: rows.filter((row) => row.stockStatus === 'out_of_stock').length,
      inventoryValuation: rows.reduce((sum, row) => sum + row.valuation, 0),
    };

    return {
      summary: {
        totalSkus: buildReportKpi(summary.totalSkus, summary.totalSkus),
        inStockSkus: buildReportKpi(summary.inStockSkus, summary.inStockSkus),
        lowStockSkus: buildReportKpi(summary.lowStockSkus, summary.lowStockSkus),
        outOfStockSkus: buildReportKpi(summary.outOfStockSkus, summary.outOfStockSkus),
        inventoryValuation: buildReportKpi(summary.inventoryValuation, summary.inventoryValuation),
      },
      rows: paginateRows(rows, query),
    };
  }

  async getVendorPerformance(query: ReportQueryDto): Promise<IVendorPerformanceReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows] = await Promise.all([
      this.reportsRepository.fetchVendorPerformanceRows(query, range),
      this.reportsRepository.fetchVendorPerformanceRows(query, prevRange),
    ]);

    const enrichedRows = rows.map((row) => this.enrichVendorRow(row));
    const current = this.summarizeVendorRows(enrichedRows);
    const previous = this.summarizeVendorRows(prevRows.map((row) => this.enrichVendorRow(row)));

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        totalVendors: buildReportKpi(current.vendors, previous.vendors),
        totalOrders: buildReportKpi(current.orders, previous.orders),
        totalRevenue: buildReportKpi(current.revenue, previous.revenue),
        avgFulfillmentRate: buildReportKpi(current.avgFulfillmentRate, previous.avgFulfillmentRate),
        avgCancellationRate: buildReportKpi(current.avgCancellationRate, previous.avgCancellationRate),
        avgReturnRate: buildReportKpi(current.avgReturnRate, previous.avgReturnRate),
      },
      rows: paginateRows(enrichedRows, query),
    };
  }

  async getCustomers(query: ReportQueryDto): Promise<ICustomerReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, currentMetrics, prevMetrics] = await Promise.all([
      this.reportsRepository.fetchCustomerRows(query, range),
      this.reportsRepository.fetchCustomerSummaryMetrics(range),
      this.reportsRepository.fetchCustomerSummaryMetrics(prevRange),
    ]);

    const mappedRows = rows.map((row) => ({
      ...row,
      avgOrderValue: row.totalOrders > 0 ? round2(row.totalSpend / row.totalOrders) : 0,
      lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
      customerLifetimeValue: round2(row.totalSpend),
    }));

    const avgOrderFrequency =
      currentMetrics.activeCustomers > 0
        ? round2(currentMetrics.totalOrders / currentMetrics.activeCustomers)
        : 0;
    const prevAvgOrderFrequency =
      prevMetrics.activeCustomers > 0
        ? round2(prevMetrics.totalOrders / prevMetrics.activeCustomers)
        : 0;
    const avgClv =
      currentMetrics.activeCustomers > 0
        ? round2(currentMetrics.totalSpend / currentMetrics.activeCustomers)
        : 0;
    const prevAvgClv =
      prevMetrics.activeCustomers > 0
        ? round2(prevMetrics.totalSpend / prevMetrics.activeCustomers)
        : 0;

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        newCustomers: buildReportKpi(currentMetrics.newCustomers, prevMetrics.newCustomers),
        returningCustomers: buildReportKpi(
          currentMetrics.returningCustomers,
          prevMetrics.returningCustomers,
        ),
        totalRegistrations: buildReportKpi(
          currentMetrics.totalRegistrations,
          prevMetrics.totalRegistrations,
        ),
        activeCustomers: buildReportKpi(currentMetrics.activeCustomers, prevMetrics.activeCustomers),
        avgOrderFrequency: buildReportKpi(avgOrderFrequency, prevAvgOrderFrequency),
        avgCustomerLifetimeValue: buildReportKpi(avgClv, prevAvgClv),
      },
      rows: paginateRows(mappedRows, query),
    };
  }

  getConsultations(query: ReportQueryDto): IConsultationReportResponse {
    const range = resolveReportRange(query);
    const zero = buildReportKpi(0, 0);
    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        booked: zero,
        completed: zero,
        cancelled: zero,
        upcoming: zero,
      },
      rows: buildEmptyPaginatedResult(query),
      meta: {
        available: false,
        note: 'Doctor consultation module is not implemented yet. Endpoint returns empty data.',
      },
    };
  }

  async getPayments(query: ReportQueryDto): Promise<IPaymentReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows] = await Promise.all([
      this.reportsRepository.fetchPaymentRows(query, range),
      this.reportsRepository.fetchPaymentRows(query, prevRange),
    ]);

    const current = this.summarizePaymentRows(rows);
    const previous = this.summarizePaymentRows(prevRows);

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        successful: buildReportKpi(current.successful, previous.successful),
        failed: buildReportKpi(current.failed, previous.failed),
        pending: buildReportKpi(current.pending, previous.pending),
        refunded: buildReportKpi(current.refunded, previous.refunded),
        totalAmount: buildReportKpi(current.totalAmount, previous.totalAmount),
      },
      rows: paginateRows(rows, query),
      meta: {
        settlementsAvailable: false,
        note: 'Vendor settlement and commission data are not stored yet.',
      },
    };
  }

  async getReturnsRefunds(query: ReportQueryDto): Promise<IReturnRefundReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows, totalOrders, prevTotalOrders] = await Promise.all([
      this.reportsRepository.fetchReturnRefundRows(query, range),
      this.reportsRepository.fetchReturnRefundRows(query, prevRange),
      this.reportsRepository.countTotalOrdersInRange(range),
      this.reportsRepository.countTotalOrdersInRange(prevRange),
    ]);

    const current = this.summarizeReturnRefundRows(rows);
    const previous = this.summarizeReturnRefundRows(prevRows);
    const returnRate = totalOrders > 0 ? round2((current.returns / totalOrders) * 100) : 0;
    const prevReturnRate =
      prevTotalOrders > 0 ? round2((previous.returns / prevTotalOrders) * 100) : 0;

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        returnRequests: buildReportKpi(current.returns, previous.returns),
        refunds: buildReportKpi(current.refunds, previous.refunds),
        refundAmount: buildReportKpi(current.refundAmount, previous.refundAmount),
        replacementRequests: buildReportKpi(0, 0),
        returnRate: buildReportKpi(returnRate, prevReturnRate),
      },
      rows: paginateRows(rows, query),
      meta: {
        replacementTrackingAvailable: false,
        note: 'Return rows use RTO/cancelled orders; refund rows use GoKwik refunds. Replacement requests are not tracked yet.',
      },
    };
  }

  async getCoupons(query: ReportQueryDto): Promise<ICouponReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows, totalOrders, prevTotalOrders] = await Promise.all([
      this.reportsRepository.fetchCouponRows(query, range),
      this.reportsRepository.fetchCouponRows(query, prevRange),
      this.reportsRepository.countTotalOrdersInRange(range),
      this.reportsRepository.countTotalOrdersInRange(prevRange),
    ]);

    const current = this.summarizeCouponRows(rows, totalOrders);
    const previous = this.summarizeCouponRows(prevRows, prevTotalOrders);

    const mappedRows = rows.map((row) => ({
      ...row,
      redemptionRate: totalOrders > 0 ? round2((row.usages / totalOrders) * 100) : 0,
    }));

    return {
      range: { startDate: range.start.toISOString(), endDate: range.end.toISOString() },
      summary: {
        totalCouponUsages: buildReportKpi(current.usages, previous.usages),
        totalDiscountGiven: buildReportKpi(current.discountAmount, previous.discountAmount),
        couponRevenue: buildReportKpi(current.revenue, previous.revenue),
        activeCouponsUsed: buildReportKpi(current.activeCoupons, previous.activeCoupons),
        avgRedemptionRate: buildReportKpi(current.avgRedemptionRate, previous.avgRedemptionRate),
      },
      rows: paginateRows(mappedRows, query),
    };
  }

  getProductPerformanceExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchProductPerformanceRows(query, range);
  }

  getInventoryExportRows(query: ReportQueryDto) {
    return this.reportsRepository.fetchInventoryRows(query);
  }

  getVendorPerformanceExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchVendorPerformanceRows(query, range).then((rows) =>
      rows.map((row) => this.enrichVendorRow(row)),
    );
  }

  getCustomerExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchCustomerRows(query, range).then((rows) =>
      rows.map((row) => ({
        ...row,
        avgOrderValue: row.totalOrders > 0 ? round2(row.totalSpend / row.totalOrders) : 0,
        lastOrderAt: row.lastOrderAt?.toISOString() ?? null,
        customerLifetimeValue: round2(row.totalSpend),
      })),
    );
  }

  getPaymentExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchPaymentRows(query, range);
  }

  getReturnRefundExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.reportsRepository.fetchReturnRefundRows(query, range);
  }

  getCouponExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return Promise.all([
      this.reportsRepository.fetchCouponRows(query, range),
      this.reportsRepository.countTotalOrdersInRange(range),
    ]).then(([rows, totalOrders]) =>
      rows.map((row) => ({
        ...row,
        redemptionRate: totalOrders > 0 ? round2((row.usages / totalOrders) * 100) : 0,
      })),
    );
  }

  private buildSalesSummary(
    rows: ISalesRevenueRow[],
    previousRows: Array<{
      orders: number;
      grossSales: number;
      discounts: number;
      shipping: number;
      netSales: number;
    }>,
  ): ISalesRevenueReportResponse['summary'] {
    const current = {
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      grossSales: rows.reduce((sum, row) => sum + row.grossSales, 0),
      discounts: rows.reduce((sum, row) => sum + row.discounts, 0),
      netSales: rows.reduce((sum, row) => sum + row.netSales, 0),
      refunds: rows.reduce((sum, row) => sum + row.refunds, 0),
    };
    const previous = {
      orders: previousRows.reduce((sum, row) => sum + row.orders, 0),
      grossSales: previousRows.reduce((sum, row) => sum + row.grossSales, 0),
      discounts: previousRows.reduce((sum, row) => sum + row.discounts, 0),
      netSales: previousRows.reduce((sum, row) => sum + row.netSales, 0),
      refunds: 0,
    };

    const currentAov = current.orders > 0 ? current.netSales / current.orders : 0;
    const prevAov = previous.orders > 0 ? previous.netSales / previous.orders : 0;

    return {
      totalOrders: this.kpi(current.orders, previous.orders),
      grossSales: this.kpi(current.grossSales, previous.grossSales),
      netSales: this.kpi(current.netSales, previous.netSales),
      taxCollected: this.kpi(0, 0),
      discounts: this.kpi(current.discounts, previous.discounts),
      refunds: this.kpi(current.refunds, previous.refunds),
      aov: this.kpi(currentAov, prevAov),
    };
  }

  private buildOrdersSummary(
    rows: IOrderReportRow[],
    prevRows: IOrderReportRow[],
  ): IOrderReportResponse['summary'] {
    const sum = (list: IOrderReportRow[], key: keyof IOrderReportRow) =>
      list.reduce((acc, row) => acc + Number(row[key] || 0), 0);

    return {
      total: this.kpi(sum(rows, 'totalOrders'), sum(prevRows, 'totalOrders')),
      pending: this.kpi(sum(rows, 'pending'), sum(prevRows, 'pending')),
      confirmed: this.kpi(sum(rows, 'confirmed'), sum(prevRows, 'confirmed')),
      shipped: this.kpi(sum(rows, 'shipped'), sum(prevRows, 'shipped')),
      delivered: this.kpi(sum(rows, 'delivered'), sum(prevRows, 'delivered')),
      cancelled: this.kpi(sum(rows, 'cancelled'), sum(prevRows, 'cancelled')),
      returned: this.kpi(sum(rows, 'returned'), sum(prevRows, 'returned')),
      refunded: this.kpi(sum(rows, 'refunded'), sum(prevRows, 'refunded')),
    };
  }

  private kpi(value: number, previousValue: number): IReportKpi {
    return {
      value: round2(value),
      previousValue: round2(previousValue),
      changePercent: changePercentage(value, previousValue),
    };
  }

  private sortSalesRows(rows: ISalesRevenueRow[], query: ReportQueryDto): ISalesRevenueRow[] {
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = query.sortOrder ?? 'DESC';
    const direction = sortOrder === 'ASC' ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (sortBy === 'date') {
        return direction * (new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      return direction * ((a[sortBy as keyof ISalesRevenueRow] as number) - (b[sortBy as keyof ISalesRevenueRow] as number));
    });
  }

  private sortOrderRows(rows: IOrderReportRow[], query: ReportQueryDto): IOrderReportRow[] {
    const sortOrder = query.sortOrder ?? 'DESC';
    const direction = sortOrder === 'ASC' ? 1 : -1;
    return [...rows].sort(
      (a, b) => direction * (new Date(a.date).getTime() - new Date(b.date).getTime()),
    );
  }

  private buildEmptySalesResponse(query: ReportQueryDto): ISalesRevenueReportResponse {
    const paginationOptions = buildPaginationOptions(query);
    return {
      range: {
        startDate: query.startDate ?? new Date().toISOString(),
        endDate: query.endDate ?? new Date().toISOString(),
      },
      summary: {
        totalOrders: this.kpi(0, 0),
        grossSales: this.kpi(0, 0),
        netSales: this.kpi(0, 0),
        taxCollected: this.kpi(0, 0),
        discounts: this.kpi(0, 0),
        refunds: this.kpi(0, 0),
        aov: this.kpi(0, 0),
      },
      rows: buildPaginatedResult([], 0, paginationOptions),
    };
  }

  private buildEmptyOrdersResponse(query: ReportQueryDto): IOrderReportResponse {
    const paginationOptions = buildPaginationOptions(query);
    return {
      range: {
        startDate: query.startDate ?? new Date().toISOString(),
        endDate: query.endDate ?? new Date().toISOString(),
      },
      summary: {
        total: this.kpi(0, 0),
        pending: this.kpi(0, 0),
        confirmed: this.kpi(0, 0),
        shipped: this.kpi(0, 0),
        delivered: this.kpi(0, 0),
        cancelled: this.kpi(0, 0),
        returned: this.kpi(0, 0),
        refunded: this.kpi(0, 0),
      },
      rows: buildPaginatedResult([], 0, paginationOptions),
    };
  }

  private summarizeProductRows(
    rows: Array<{ unitsSold: number; revenue: number }>,
  ): { productsSold: number; unitsSold: number; revenue: number } {
    return {
      productsSold: rows.length,
      unitsSold: rows.reduce((sum, row) => sum + row.unitsSold, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
    };
  }

  private enrichVendorRow(row: {
    vendorId: string;
    vendorRefId: string;
    vendorName: string;
    orders: number;
    revenue: number;
    delivered: number;
    cancelled: number;
    returned: number;
    activeProducts: number;
  }) {
    const fulfillmentRate = row.orders > 0 ? round2((row.delivered / row.orders) * 100) : 0;
    const cancellationRate = row.orders > 0 ? round2((row.cancelled / row.orders) * 100) : 0;
    const returnRate = row.orders > 0 ? round2((row.returned / row.orders) * 100) : 0;
    return { ...row, fulfillmentRate, cancellationRate, returnRate };
  }

  private summarizeVendorRows(
    rows: Array<{
      orders: number;
      revenue: number;
      delivered: number;
      cancelled: number;
      returned: number;
      fulfillmentRate: number;
      cancellationRate: number;
      returnRate: number;
    }>,
  ) {
    const count = rows.length || 1;
    return {
      vendors: rows.length,
      orders: rows.reduce((sum, row) => sum + row.orders, 0),
      revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
      avgFulfillmentRate: round2(rows.reduce((sum, row) => sum + row.fulfillmentRate, 0) / count),
      avgCancellationRate: round2(rows.reduce((sum, row) => sum + row.cancellationRate, 0) / count),
      avgReturnRate: round2(rows.reduce((sum, row) => sum + row.returnRate, 0) / count),
    };
  }

  private summarizePaymentRows(
    rows: Array<{
      successful: number;
      failed: number;
      pending: number;
      refunded: number;
      successfulAmount: number;
      failedAmount: number;
      pendingAmount: number;
      refundedAmount: number;
    }>,
  ) {
    return {
      successful: rows.reduce((sum, row) => sum + row.successful, 0),
      failed: rows.reduce((sum, row) => sum + row.failed, 0),
      pending: rows.reduce((sum, row) => sum + row.pending, 0),
      refunded: rows.reduce((sum, row) => sum + row.refunded, 0),
      totalAmount: rows.reduce(
        (sum, row) =>
          sum + row.successfulAmount + row.failedAmount + row.pendingAmount + row.refundedAmount,
        0,
      ),
    };
  }

  private summarizeReturnRefundRows(rows: Array<{ type: 'return' | 'refund'; amount: number }>) {
    const returns = rows.filter((row) => row.type === 'return').length;
    const refunds = rows.filter((row) => row.type === 'refund').length;
    const refundAmount = rows
      .filter((row) => row.type === 'refund')
      .reduce((sum, row) => sum + row.amount, 0);
    return { returns, refunds, refundAmount };
  }

  private summarizeCouponRows(
    rows: Array<{ usages: number; discountAmount: number; revenue: number }>,
    totalOrders: number,
  ) {
    const usages = rows.reduce((sum, row) => sum + row.usages, 0);
    const discountAmount = rows.reduce((sum, row) => sum + row.discountAmount, 0);
    const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
    const avgRedemptionRate = totalOrders > 0 ? round2((usages / totalOrders) * 100) : 0;
    return {
      usages,
      discountAmount,
      revenue,
      activeCoupons: rows.length,
      avgRedemptionRate,
    };
  }
}
