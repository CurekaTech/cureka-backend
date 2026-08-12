import { PaginatedResult } from '@packages/common';

export interface IReportKpi {
  value: number;
  previousValue: number;
  changePercent: number;
}

export interface IReportRange {
  startDate: string;
  endDate: string;
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
  range: IReportRange;
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

export interface IOrderReportRow {
  orderId: string;
  orderNumber: string;
  date: string;
  placedAt: string;
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
}

export interface IOrderReportResponse {
  range: IReportRange;
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

export interface IProductPerformanceRow {
  productId: string;
  productRefId: string;
  productName: string;
  sku: string;
  unitsSold: number;
  ordersCount: number;
  revenue: number;
  stock: number;
  outOfStock: boolean;
}

export interface IProductPerformanceReportResponse {
  range: IReportRange;
  summary: {
    totalProductsSold: IReportKpi;
    totalUnitsSold: IReportKpi;
    totalRevenue: IReportKpi;
    outOfStockProducts: IReportKpi;
  };
  rows: PaginatedResult<IProductPerformanceRow>;
}

export interface IInventoryStockRow {
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
}

export interface IInventoryStockReportResponse {
  summary: {
    totalSkus: IReportKpi;
    inStockSkus: IReportKpi;
    lowStockSkus: IReportKpi;
    outOfStockSkus: IReportKpi;
    inventoryValuation: IReportKpi;
  };
  rows: PaginatedResult<IInventoryStockRow>;
}

export interface IVendorPerformanceRow {
  vendorId: string;
  vendorRefId: string;
  vendorName: string;
  orders: number;
  revenue: number;
  delivered: number;
  cancelled: number;
  returned: number;
  activeProducts: number;
  fulfillmentRate: number;
  cancellationRate: number;
  returnRate: number;
}

export interface IVendorPerformanceReportResponse {
  range: IReportRange;
  summary: {
    totalVendors: IReportKpi;
    totalOrders: IReportKpi;
    totalRevenue: IReportKpi;
    avgFulfillmentRate: IReportKpi;
    avgCancellationRate: IReportKpi;
    avgReturnRate: IReportKpi;
  };
  rows: PaginatedResult<IVendorPerformanceRow>;
}

export interface ICustomerReportRow {
  userId: string;
  userRefId: string;
  name: string;
  email: string | null;
  phone: string | null;
  isGuest: boolean;
  totalOrders: number;
  totalSpend: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  customerLifetimeValue: number;
}

export interface ICustomerReportResponse {
  range: IReportRange;
  summary: {
    newCustomers: IReportKpi;
    returningCustomers: IReportKpi;
    totalRegistrations: IReportKpi;
    activeCustomers: IReportKpi;
    avgOrderFrequency: IReportKpi;
    avgCustomerLifetimeValue: IReportKpi;
  };
  rows: PaginatedResult<ICustomerReportRow>;
}

export interface IConsultationReportResponse {
  range: IReportRange;
  summary: {
    booked: IReportKpi;
    completed: IReportKpi;
    cancelled: IReportKpi;
    upcoming: IReportKpi;
  };
  rows: PaginatedResult<{
    date: string;
    doctorName: string;
    status: string;
    patientName: string;
  }>;
  meta: {
    available: false;
    note: string;
  };
}

export interface IPaymentReportRow {
  paymentMethod: string;
  successful: number;
  failed: number;
  pending: number;
  refunded: number;
  successfulAmount: number;
  failedAmount: number;
  pendingAmount: number;
  refundedAmount: number;
}

export interface IPaymentReportResponse {
  range: IReportRange;
  summary: {
    successful: IReportKpi;
    failed: IReportKpi;
    pending: IReportKpi;
    refunded: IReportKpi;
    totalAmount: IReportKpi;
  };
  rows: PaginatedResult<IPaymentReportRow>;
  meta: {
    settlementsAvailable: false;
    note: string;
  };
}

export interface IReturnRefundRow {
  date: string;
  orderNumber: string;
  type: 'return' | 'refund' | 'replacement';
  amount: number;
  reason: string | null;
  status: string;
}

export interface IReturnRefundReportResponse {
  range: IReportRange;
  summary: {
    returnRequests: IReportKpi;
    refunds: IReportKpi;
    refundAmount: IReportKpi;
    replacementRequests: IReportKpi;
    returnRate: IReportKpi;
  };
  rows: PaginatedResult<IReturnRefundRow>;
  meta: {
    replacementTrackingAvailable: false;
    note: string;
  };
}

export interface ICouponReportRow {
  couponId: string;
  couponCode: string;
  couponTitle: string;
  usages: number;
  discountAmount: number;
  revenue: number;
  redemptionRate: number;
}

export interface ICouponReportResponse {
  range: IReportRange;
  summary: {
    totalCouponUsages: IReportKpi;
    totalDiscountGiven: IReportKpi;
    couponRevenue: IReportKpi;
    activeCouponsUsed: IReportKpi;
    avgRedemptionRate: IReportKpi;
  };
  rows: PaginatedResult<ICouponReportRow>;
}
