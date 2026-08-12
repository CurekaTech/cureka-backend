import { PaginatedResult } from '@packages/common';

export interface IReportKpi {
  value: number;
  previousValue: number;
  changePercent: number;
}

export interface ISalesRevenueRow {
  date: string;
  type: 'product';
  orders: number;
  grossSales: number;
  discounts: number;
  tax: number;
  shipping: number;
  refunds: number;
  netSales: number;
  aov: number;
}

export interface ISalesRevenueReportResponse {
  range: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalOrders: IReportKpi;
    grossSales: IReportKpi;
    netSales: IReportKpi;
    taxCollected: IReportKpi;
    discounts: IReportKpi;
    refunds: IReportKpi;
    aov: IReportKpi;
  };
  rows: PaginatedResult<ISalesRevenueRow>;
}

