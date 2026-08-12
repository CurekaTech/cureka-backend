import { PaginatedResult } from '@packages/common';
import { IReportKpi } from './sales-revenue-report.interface';

export interface IOrderReportRow {
  date: string;
  totalOrders: number;
  pending: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  returned: number;
  refunded: number;
}

export interface IOrderReportResponse {
  range: {
    startDate: string;
    endDate: string;
  };
  summary: {
    total: IReportKpi;
    pending: IReportKpi;
    confirmed: IReportKpi;
    shipped: IReportKpi;
    delivered: IReportKpi;
    cancelled: IReportKpi;
    returned: IReportKpi;
    refunded: IReportKpi;
  };
  rows: PaginatedResult<IOrderReportRow>;
}

