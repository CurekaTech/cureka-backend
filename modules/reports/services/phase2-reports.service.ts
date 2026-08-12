import { Injectable } from '@nestjs/common';
import { previousPeriodRange, round2 } from '@modules/dashboard/utils/dashboard-format.util';
import { ReportQueryDto } from '../dto/report-query.dto';
import {
  IConsultationReportResponse,
  ICouponReportResponse,
  ICustomerReportResponse,
  IInventoryStockReportResponse,
  IPaymentReportResponse,
  IProductPerformanceReportResponse,
  IReturnRefundReportResponse,
  IVendorPerformanceReportResponse,
} from '../interfaces/phase2-reports.interface';
import { ReportsPhase2Repository } from '../repositories/reports-phase2.repository';
import {
  buildEmptyPaginatedResult,
  buildReportKpi,
  paginateRows,
  resolveReportRange,
} from '../utils/report-base.util';

@Injectable()
export class Phase2ReportsService {
  constructor(private readonly phase2Repository: ReportsPhase2Repository) {}

  async getProductPerformance(query: ReportQueryDto): Promise<IProductPerformanceReportResponse> {
    const range = resolveReportRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows, outOfStockProducts] = await Promise.all([
      this.phase2Repository.fetchProductPerformanceRows(query, range),
      this.phase2Repository.fetchProductPerformanceRows(query, prevRange),
      this.phase2Repository.countOutOfStockProducts(),
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
    const rows = await this.phase2Repository.fetchInventoryRows(query);
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
      this.phase2Repository.fetchVendorPerformanceRows(query, range),
      this.phase2Repository.fetchVendorPerformanceRows(query, prevRange),
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
      this.phase2Repository.fetchCustomerRows(query, range),
      this.phase2Repository.fetchCustomerSummaryMetrics(range),
      this.phase2Repository.fetchCustomerSummaryMetrics(prevRange),
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
      this.phase2Repository.fetchPaymentRows(query, range),
      this.phase2Repository.fetchPaymentRows(query, prevRange),
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
      this.phase2Repository.fetchReturnRefundRows(query, range),
      this.phase2Repository.fetchReturnRefundRows(query, prevRange),
      this.phase2Repository.countTotalOrdersInRange(range),
      this.phase2Repository.countTotalOrdersInRange(prevRange),
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
      this.phase2Repository.fetchCouponRows(query, range),
      this.phase2Repository.fetchCouponRows(query, prevRange),
      this.phase2Repository.countTotalOrdersInRange(range),
      this.phase2Repository.countTotalOrdersInRange(prevRange),
    ]);

    const current = this.summarizeCouponRows(rows, totalOrders);
    const previous = this.summarizeCouponRows(prevRows, prevTotalOrders);

    const mappedRows = rows.map((row) => ({
      ...row,
      redemptionRate:
        totalOrders > 0 ? round2((row.usages / totalOrders) * 100) : 0,
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
    return this.phase2Repository.fetchProductPerformanceRows(query, range);
  }

  getInventoryExportRows(query: ReportQueryDto) {
    return this.phase2Repository.fetchInventoryRows(query);
  }

  getVendorPerformanceExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.phase2Repository.fetchVendorPerformanceRows(query, range).then((rows) =>
      rows.map((row) => this.enrichVendorRow(row)),
    );
  }

  getCustomerExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.phase2Repository.fetchCustomerRows(query, range).then((rows) =>
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
    return this.phase2Repository.fetchPaymentRows(query, range);
  }

  getReturnRefundExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return this.phase2Repository.fetchReturnRefundRows(query, range);
  }

  getCouponExportRows(query: ReportQueryDto) {
    const range = resolveReportRange(query);
    return Promise.all([
      this.phase2Repository.fetchCouponRows(query, range),
      this.phase2Repository.countTotalOrdersInRange(range),
    ]).then(([rows, totalOrders]) =>
      rows.map((row) => ({
        ...row,
        redemptionRate: totalOrders > 0 ? round2((row.usages / totalOrders) * 100) : 0,
      })),
    );
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

  private summarizeReturnRefundRows(
    rows: Array<{ type: 'return' | 'refund'; amount: number }>,
  ) {
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
