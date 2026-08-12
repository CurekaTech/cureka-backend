import { Injectable } from '@nestjs/common';
import {
  buildPaginatedResult,
  buildPaginationOptions,
} from '@packages/common';
import {
  changePercentage,
  endOfDay,
  previousPeriodRange,
  startOfDay,
} from '@modules/dashboard/utils/dashboard-format.util';
import { ReportQueryDto } from '../dto/report-query.dto';
import { IOrderReportResponse, IOrderReportRow } from '../interfaces/order-report.interface';
import { IReportKpi } from '../interfaces/sales-revenue-report.interface';
import { ReportDateRange, ReportsRepository } from '../repositories/reports.repository';

@Injectable()
export class OrderReportService {
  constructor(private readonly reportsRepository: ReportsRepository) {}

  async getReport(query: ReportQueryDto): Promise<IOrderReportResponse> {
    if (query.type === 'consultation') {
      return this.buildEmptyResponse(query);
    }

    const range = this.resolveRange(query);
    const prevRange = previousPeriodRange(range.start, range.end);
    const [rows, prevRows] = await Promise.all([
      this.reportsRepository.fetchOrderStatusRows(query, range),
      this.reportsRepository.fetchOrderStatusRows(query, prevRange),
    ]);

    const sortedRows = this.sortRows(rows, query);
    const paginationOptions = buildPaginationOptions(query);
    const total = sortedRows.length;
    const start = (paginationOptions.page - 1) * paginationOptions.limit;
    const pagedRows = sortedRows.slice(start, start + paginationOptions.limit);

    return {
      range: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      summary: this.buildSummary(rows, prevRows),
      rows: buildPaginatedResult(pagedRows, total, paginationOptions),
    };
  }

  async getExportRows(query: ReportQueryDto): Promise<IOrderReportRow[]> {
    const range = this.resolveRange(query);
    return this.reportsRepository.fetchOrderStatusRows(query, range);
  }

  private buildSummary(rows: IOrderReportRow[], prevRows: IOrderReportRow[]): IOrderReportResponse['summary'] {
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
      value,
      previousValue,
      changePercent: changePercentage(value, previousValue),
    };
  }

  private resolveRange(query: ReportQueryDto): ReportDateRange {
    const now = new Date();
    const start = query.startDate ? startOfDay(new Date(query.startDate)) : startOfDay(now);
    const end = query.endDate ? endOfDay(new Date(query.endDate)) : endOfDay(now);
    return { start, end };
  }

  private sortRows(rows: IOrderReportRow[], query: ReportQueryDto): IOrderReportRow[] {
    const sortOrder = query.sortOrder ?? 'DESC';
    const direction = sortOrder === 'ASC' ? 1 : -1;
    return [...rows].sort(
      (a, b) => direction * (new Date(a.date).getTime() - new Date(b.date).getTime()),
    );
  }

  private buildEmptyResponse(query: ReportQueryDto): IOrderReportResponse {
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
}

