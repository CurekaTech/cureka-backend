import {
  buildPaginatedResult,
  buildPaginationOptions,
  PaginatedResult,
} from '@packages/common';
import {
  changePercentage,
  endOfDay,
  round2,
  startOfDay,
} from '@modules/dashboard/utils/dashboard-format.util';
import { ReportQueryDto } from '../dto/report-query.dto';
import { IReportKpi } from '../reports.interface';
import { ReportDateRange } from '../repositories/reports.repository';

export function resolveReportRange(query: ReportQueryDto): ReportDateRange {
  const now = new Date();
  const start = query.startDate ? startOfDay(new Date(query.startDate)) : startOfDay(now);
  const end = query.endDate ? endOfDay(new Date(query.endDate)) : endOfDay(now);
  return { start, end };
}

export function buildReportKpi(value: number, previousValue: number): IReportKpi {
  return {
    value: round2(value),
    previousValue: round2(previousValue),
    changePercent: changePercentage(value, previousValue),
  };
}

export function paginateRows<T>(
  rows: T[],
  query: ReportQueryDto,
): PaginatedResult<T> {
  const paginationOptions = buildPaginationOptions(query);
  const total = rows.length;
  const start = (paginationOptions.page - 1) * paginationOptions.limit;
  const pagedRows = rows.slice(start, start + paginationOptions.limit);
  return buildPaginatedResult(pagedRows, total, paginationOptions);
}

export function buildEmptyPaginatedResult<T>(query: ReportQueryDto): PaginatedResult<T> {
  return buildPaginatedResult([], 0, buildPaginationOptions(query));
}
