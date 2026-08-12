import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  ICouponReportRow,
  ICustomerReportRow,
  IInventoryStockRow,
  IOrderReportRow,
  IPaymentReportRow,
  IProductPerformanceRow,
  IReturnRefundRow,
  ISalesRevenueRow,
  IVendorPerformanceRow,
} from '../reports.interface';

@Injectable()
export class ReportExportService {
  async buildSalesRevenueWorkbook(
    rows: ISalesRevenueRow[],
    startDate?: string,
    endDate?: string,
  ): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Breakdown');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 16 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Orders', key: 'orders', width: 12 },
      { header: 'Gross Sales', key: 'grossSales', width: 16 },
      { header: 'Discounts', key: 'discounts', width: 14 },
      { header: 'Tax', key: 'tax', width: 10 },
      { header: 'Shipping', key: 'shipping', width: 14 },
      { header: 'Refunds', key: 'refunds', width: 14 },
      { header: 'Net Sales', key: 'netSales', width: 14 },
      { header: 'AOV', key: 'aov', width: 10 },
    ];

    rows.forEach((row) => sheet.addRow(row));
    this.styleHeader(sheet);

    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `sales-revenue-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`;
    return { fileName, fileBuffer };
  }

  async buildOrderWorkbook(
    rows: IOrderReportRow[],
    startDate?: string,
    endDate?: string,
  ): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Breakdown');
    sheet.columns = [
      { header: 'Date', key: 'date', width: 16 },
      { header: 'Total Orders', key: 'totalOrders', width: 14 },
      { header: 'Pending', key: 'pending', width: 12 },
      { header: 'Confirmed', key: 'confirmed', width: 12 },
      { header: 'Shipped', key: 'shipped', width: 12 },
      { header: 'Delivered', key: 'delivered', width: 12 },
      { header: 'Cancelled', key: 'cancelled', width: 12 },
      { header: 'Returned', key: 'returned', width: 12 },
      { header: 'Refunded', key: 'refunded', width: 12 },
    ];

    rows.forEach((row) => sheet.addRow(row));
    this.styleHeader(sheet);

    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `order-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`;
    return { fileName, fileBuffer };
  }

  async buildProductPerformanceWorkbook(
    rows: IProductPerformanceRow[],
    startDate?: string,
    endDate?: string,
  ) {
    return this.buildWorkbook({
      sheetName: 'Product Performance',
      columns: [
        { header: 'Product', key: 'productName', width: 30 },
        { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Units Sold', key: 'unitsSold', width: 12 },
        { header: 'Orders', key: 'ordersCount', width: 10 },
        { header: 'Revenue', key: 'revenue', width: 14 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Out Of Stock', key: 'outOfStock', width: 14 },
      ],
      rows,
      fileName: `product-performance-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  async buildInventoryWorkbook(rows: IInventoryStockRow[]) {
    return this.buildWorkbook({
      sheetName: 'Inventory',
      columns: [
        { header: 'Product', key: 'productName', width: 30 },
        { header: 'SKU', key: 'sku', width: 16 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'MRP', key: 'mrp', width: 12 },
        { header: 'Selling Price', key: 'sellingPrice', width: 14 },
        { header: 'Valuation', key: 'valuation', width: 14 },
        { header: 'Status', key: 'stockStatus', width: 14 },
      ],
      rows,
      fileName: 'inventory-stock-report.xlsx',
    });
  }

  async buildVendorPerformanceWorkbook(
    rows: IVendorPerformanceRow[],
    startDate?: string,
    endDate?: string,
  ) {
    return this.buildWorkbook({
      sheetName: 'Vendor Performance',
      columns: [
        { header: 'Vendor', key: 'vendorName', width: 28 },
        { header: 'Orders', key: 'orders', width: 10 },
        { header: 'Revenue', key: 'revenue', width: 14 },
        { header: 'Delivered', key: 'delivered', width: 12 },
        { header: 'Cancelled', key: 'cancelled', width: 12 },
        { header: 'Returned', key: 'returned', width: 12 },
        { header: 'Active Products', key: 'activeProducts', width: 14 },
        { header: 'Fulfillment %', key: 'fulfillmentRate', width: 14 },
      ],
      rows,
      fileName: `vendor-performance-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  async buildCustomerWorkbook(
    rows: ICustomerReportRow[],
    startDate?: string,
    endDate?: string,
  ) {
    return this.buildWorkbook({
      sheetName: 'Customers',
      columns: [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Email', key: 'email', width: 24 },
        { header: 'Phone', key: 'phone', width: 14 },
        { header: 'Guest', key: 'isGuest', width: 8 },
        { header: 'Orders', key: 'totalOrders', width: 10 },
        { header: 'Spend', key: 'totalSpend', width: 14 },
        { header: 'AOV', key: 'avgOrderValue', width: 12 },
        { header: 'CLV', key: 'customerLifetimeValue', width: 12 },
        { header: 'Last Order', key: 'lastOrderAt', width: 18 },
      ],
      rows,
      fileName: `customer-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  async buildPaymentWorkbook(rows: IPaymentReportRow[], startDate?: string, endDate?: string) {
    return this.buildWorkbook({
      sheetName: 'Payments',
      columns: [
        { header: 'Payment Method', key: 'paymentMethod', width: 18 },
        { header: 'Successful', key: 'successful', width: 12 },
        { header: 'Failed', key: 'failed', width: 10 },
        { header: 'Pending', key: 'pending', width: 10 },
        { header: 'Refunded', key: 'refunded', width: 10 },
        { header: 'Success Amount', key: 'successfulAmount', width: 14 },
        { header: 'Refund Amount', key: 'refundedAmount', width: 14 },
      ],
      rows,
      fileName: `payment-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  async buildReturnRefundWorkbook(
    rows: IReturnRefundRow[],
    startDate?: string,
    endDate?: string,
  ) {
    return this.buildWorkbook({
      sheetName: 'Returns & Refunds',
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Order', key: 'orderNumber', width: 18 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Amount', key: 'amount', width: 12 },
        { header: 'Reason', key: 'reason', width: 28 },
        { header: 'Status', key: 'status', width: 14 },
      ],
      rows,
      fileName: `return-refund-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  async buildCouponWorkbook(rows: ICouponReportRow[], startDate?: string, endDate?: string) {
    return this.buildWorkbook({
      sheetName: 'Coupons',
      columns: [
        { header: 'Code', key: 'couponCode', width: 16 },
        { header: 'Title', key: 'couponTitle', width: 24 },
        { header: 'Usages', key: 'usages', width: 10 },
        { header: 'Discount', key: 'discountAmount', width: 12 },
        { header: 'Revenue', key: 'revenue', width: 12 },
        { header: 'Redemption %', key: 'redemptionRate', width: 14 },
      ],
      rows,
      fileName: `coupon-report-${startDate ?? 'all'}-${endDate ?? 'all'}.xlsx`,
    });
  }

  private async buildWorkbook(params: {
    sheetName: string;
    columns: Array<{ header: string; key: string; width: number }>;
    rows: object[];
    fileName: string;
  }): Promise<{ fileName: string; fileBuffer: Buffer }> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(params.sheetName);
    sheet.columns = params.columns;
    params.rows.forEach((row) => sheet.addRow(row as ExcelJS.RowValues));
    this.styleHeader(sheet);
    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { fileName: params.fileName, fileBuffer };
  }

  private styleHeader(sheet: ExcelJS.Worksheet): void {
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
  }
}

