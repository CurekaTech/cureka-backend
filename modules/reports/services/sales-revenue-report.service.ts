import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
} from '@packages/common';
import {
  changePercentage,
  endOfDay,
  previousPeriodRange,
  round2,
  startOfDay,
} from '@modules/dashboard/utils/dashboard-format.util';
import { ReportQueryDto } from '../dto/report-query.dto';
import {
  IReportKpi,
  ISalesRevenueReportResponse,
  ISalesRevenueRow,
} from '../interfaces/sales-revenue-report.interface';
import { ReportDateRange, ReportsRepository } from '../repositories/reports.repository';

@Injectable()
export class SalesRevenueReportService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async getReport(query: ReportQueryDto): Promise<ISalesRevenueReportResponse> {
    if (query.type === 'consultation') {
      return this.buildEmptyResponse(query);
    }

    const range = this.resolveRange(query);
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

    const sortedRows = this.sortRows(rowsWithRefunds, query);
    const paginationOptions = buildPaginationOptions(query);
    const total = sortedRows.length;
    const start = (paginationOptions.page - 1) * paginationOptions.limit;
    const pagedRows = sortedRows.slice(start, start + paginationOptions.limit);

    return {
      range: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      summary: this.buildSummary(rowsWithRefunds, previousRows),
      rows: buildPaginatedResult<ISalesRevenueRow>(pagedRows, total, paginationOptions),
    };
  }

  async getExportRows(query: ReportQueryDto): Promise<ISalesRevenueRow[]> {
    const range = this.resolveRange(query);
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

  private buildSummary(
    rows: ISalesRevenueRow[],
    previousRows: Array<{ orders: number; grossSales: number; discounts: number; shipping: number; netSales: number }>,
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

  private kpi(value: number, previousValue: number): IReportKpi {
    return {
      value: round2(value),
      previousValue: round2(previousValue),
      changePercent: changePercentage(value, previousValue),
    };
  }

  private resolveRange(query: ReportQueryDto): ReportDateRange {
    const now = new Date();
    const start = query.startDate ? startOfDay(new Date(query.startDate)) : startOfDay(now);
    const end = query.endDate ? endOfDay(new Date(query.endDate)) : endOfDay(now);
    return { start, end };
  }

  private sortRows(rows: ISalesRevenueRow[], query: ReportQueryDto): ISalesRevenueRow[] {
    const sortBy = query.sortBy ?? 'date';
    const sortOrder = query.sortOrder ?? 'DESC';
    const direction = sortOrder === 'ASC' ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (sortBy === 'date') {
        return direction * (new Date(a.date).getTime() - new Date(b.date).getTime());
      }
      return direction * ((a[sortBy] as number) - (b[sortBy] as number));
    });
  }

  private buildEmptyResponse(query: ReportQueryDto): ISalesRevenueReportResponse {
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
}

