import { Injectable, Logger } from '@nestjs/common';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { CouponUsageEntity } from '@modules/orders/entities/coupon-usage.entity';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { CouponEntity } from '@modules/master/entities/coupon.entity';
import { UserEntity } from '@modules/users/entities/user.entity';
import { UserRole } from '@modules/users/enums/user-role.enum';
import { DataSource, SelectQueryBuilder } from 'typeorm';
import {
  DASHBOARD_BRAND_COLORS,
  DASHBOARD_CATEGORY_COLORS,
  DASHBOARD_CHANNEL_COLORS,
  DASHBOARD_ORDER_STATUS_GROUPS,
  DASHBOARD_PAYMENT_BUCKETS,
  REVENUE_EXCLUDED_STATUSES,
  resolveOrderSources,
} from '../constants/dashboard.constants';
import { DashboardPeriod, DashboardQueryDto, DashboardViewAllQueryDto } from '../dto/dashboard-query.dto';
import {
  buildPaginatedResult,
  buildPaginationOptions,
} from '@packages/common';
import {
  addDays,
  buildKpiMetric,
  changePercentage,
  endOfDay,
  formatCount,
  formatInr,
  formatPercent,
  formatSignedPercent,
  previousPeriodRange,
  relativeTime,
  round2,
  startOfDay,
  toNumber,
} from '../utils/dashboard-format.util';

type DateRange = { start: Date; end: Date };

@Injectable()
export class AdminDashboardService {
  private readonly logger = new Logger(AdminDashboardService.name);

  constructor(private readonly dataSource: DataSource) {}

  async getOverview(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    // Compact defaults for homepage widgets (View All uses dedicated endpoints).
    const dashboardQuery: DashboardQueryDto = {
      ...query,
      limit: undefined,
    };

    const [
      kpis,
      revenueOverview,
      orderStatus,
      recentActivities,
      topProducts,
      customerAnalytics,
      brandPerformance,
      categoryPerformance,
      salesChannels,
      paymentMethods,
      searchAnalytics,
      marketingPerformance,
      consultationAnalytics,
    ] = await Promise.all([
      this.getKpis(dashboardQuery),
      this.getRevenueOverview(dashboardQuery),
      this.getOrdersByStatus(dashboardQuery),
      this.getRecentActivities({ ...dashboardQuery, limit: 6 }),
      this.getTopProducts({ ...dashboardQuery, limit: 5 }),
      this.getCustomerAnalytics(dashboardQuery),
      this.getBrandPerformance({ ...dashboardQuery, limit: 5 }),
      this.getCategoryPerformance(dashboardQuery),
      this.getSalesChannels(dashboardQuery),
      this.getPaymentMethods(dashboardQuery),
      this.getSearchAnalytics({ ...dashboardQuery, limit: 5 }),
      this.getMarketingPerformance(dashboardQuery),
      this.getConsultationAnalytics(dashboardQuery),
    ]);

    return {
      range: {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
      },
      kpis,
      revenueOverview,
      orderStatus,
      recentActivities,
      topProducts,
      customerAnalytics,
      brandPerformance,
      categoryPerformance,
      salesChannels,
      paymentMethods,
      searchAnalytics,
      marketingPerformance,
      consultationAnalytics,
    };
  }

  async getKpis(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const previous = previousPeriodRange(range.start, range.end);
    const sources = resolveOrderSources(query.channel);

    const [current, prev] = await Promise.all([
      this.computeKpiSnapshot(range, sources),
      this.computeKpiSnapshot(previous, sources),
    ]);

    return {
      totalRevenue: buildKpiMetric({
        valueFormatted: formatInr(current.revenue),
        rawValue: current.revenue,
        current: current.revenue,
        previous: prev.revenue,
      }),
      totalOrders: buildKpiMetric({
        valueFormatted: formatCount(current.orders),
        rawValue: current.orders,
        current: current.orders,
        previous: prev.orders,
      }),
      averageOrderValue: buildKpiMetric({
        valueFormatted: formatInr(current.aov),
        rawValue: current.aov,
        current: current.aov,
        previous: prev.aov,
      }),
      conversionRate: buildKpiMetric({
        valueFormatted: formatPercent(0),
        rawValue: 0,
        current: 0,
        previous: 0,
      }),
      totalCustomers: buildKpiMetric({
        valueFormatted: formatCount(current.customers),
        rawValue: current.customers,
        current: current.customers,
        previous: prev.customers,
      }),
      totalGuests: buildKpiMetric({
        valueFormatted: formatCount(current.guests),
        rawValue: current.guests,
        current: current.guests,
        previous: prev.guests,
      }),
      consultations: buildKpiMetric({
        valueFormatted: formatCount(0),
        rawValue: 0,
        current: 0,
        previous: 0,
      }),
      meta: {
        conversionRateAvailable: false,
        consultationsAvailable: false,
        note:
          'totalCustomers counts registered (non-guest) users only. totalGuests is guest checkout accounts. conversionRate and consultations are placeholders until session analytics and doctor-consultation modules exist.',
      },
    };
  }

  async getRevenueOverview(query: DashboardQueryDto) {
    const period = (query.period ?? 'monthly') as DashboardPeriod;
    const year = query.year ?? new Date().getUTCFullYear();
    const sources = resolveOrderSources(query.channel);

    if (period === 'yearly') {
      const start = new Date(Date.UTC(year - 4, 0, 1));
      const end = endOfDay(new Date(Date.UTC(year, 11, 31)));
      const rows = await this.revenueSeries(start, end, 'year', sources);
      return rows.map((row) => ({
        label: String(row.bucket),
        revenue: round2(toNumber(row.revenue)),
      }));
    }

    if (period === 'quarterly') {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = endOfDay(new Date(Date.UTC(year, 11, 31)));
      const rows = await this.revenueSeries(start, end, 'quarter', sources);
      return [1, 2, 3, 4].map((q) => {
        const match = rows.find((row) => Number(row.bucket) === q);
        return {
          label: `Q${q}`,
          revenue: round2(toNumber(match?.revenue)),
        };
      });
    }

    // monthly (default) + daily/weekly fall back to monthly for chart compatibility
    const start = new Date(Date.UTC(year, 0, 1));
    const end = endOfDay(new Date(Date.UTC(year, 11, 31)));
    const rows = await this.revenueSeries(start, end, 'month', sources);
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return labels.map((label, index) => {
      const match = rows.find((row) => Number(row.bucket) === index + 1);
      return {
        label,
        revenue: round2(toNumber(match?.revenue)),
      };
    });
  }

  async getOrdersByStatus(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);
    const qb = this.baseOrdersQb(range, sources)
      .select('order.orderStatus', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('order.orderStatus');

    const rows = await qb.getRawMany<{ status: OrderStatus; count: string }>();
    const counts = new Map<OrderStatus, number>();
    for (const row of rows) {
      counts.set(row.status, toNumber(row.count));
    }

    const totalOrders = [...counts.values()].reduce((sum, n) => sum + n, 0);
    const breakdown = DASHBOARD_ORDER_STATUS_GROUPS.map((group) => {
      const count = group.orderStatuses.reduce((sum, status) => sum + (counts.get(status) ?? 0), 0);
      const percentage = totalOrders > 0 ? round2((count / totalOrders) * 100) : 0;
      return {
        status: group.status,
        name: group.name,
        count,
        percentage,
        color: group.color,
      };
    });

    return { totalOrders, breakdown };
  }

  async getRecentActivities(query: DashboardQueryDto) {
    const limit = query.limit ?? 6;
    const now = new Date();

    const [orders, users] = await Promise.all([
      this.dataSource
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.user', 'user')
        .orderBy('order.createdAt', 'DESC')
        .take(limit)
        .getMany(),
      this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .where('user.role = :role', { role: UserRole.CUSTOMER })
        .andWhere('user.isGuest = :isGuest', { isGuest: false })
        .orderBy('user.createdAt', 'DESC')
        .take(limit)
        .getMany(),
    ]);

    const activities = [
      ...orders.map((order) => {
        const ts = order.placedAt ?? order.createdAt;
        const isGuest = Boolean(order.user?.isGuest);
        const name =
          [order.user?.firstName, order.user?.lastName].filter(Boolean).join(' ').trim() ||
          order.recipientName ||
          (isGuest ? 'Guest' : 'Customer');
        return {
          id: `order_${order.id}`,
          type: 'ORDER_PLACED' as const,
          title: `Order #${order.orderNumber}`,
          subtitle: `placed by ${name}${isGuest ? ' (guest)' : ''}`,
          timestamp: ts.toISOString(),
          relativeTime: relativeTime(ts, now),
          color: '#3b82f6',
          sortAt: ts.getTime(),
        };
      }),
      ...users.map((user) => {
        const name =
          [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
          user.mobileNumber ||
          'New user';
        return {
          id: `user_${user.id}`,
          type: 'USER_REGISTERED' as const,
          title: 'New user registered',
          subtitle: name,
          timestamp: user.createdAt.toISOString(),
          relativeTime: relativeTime(user.createdAt, now),
          color: '#8b5cf6',
          sortAt: user.createdAt.getTime(),
        };
      }),
    ]
      .sort((a, b) => b.sortAt - a.sortAt)
      .slice(0, limit)
      .map(({ sortAt: _sortAt, ...rest }) => rest);

    return activities;
  }

  async getTopProducts(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);
    const limit = query.limit ?? 10;
    const sortBy = query.sortBy ?? 'revenue';

    const qb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .leftJoin(ProductEntity, 'product', 'product.id = item.productId')
      .select('item.productId', 'productId')
      .addSelect('MAX(item.productName)', 'productName')
      .addSelect('MAX(item.sku)', 'sku')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT order.id)', 'ordersCount')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      });

    if (sources?.length) {
      qb.andWhere('order.orderSource IN (:...sources)', { sources });
    }

    qb.groupBy('item.productId').orderBy(
      sortBy === 'orders' ? 'ordersCount' : 'revenue',
      'DESC',
    ).take(limit);

    const rows = await qb.getRawMany<{
      productId: string;
      productName: string;
      sku: string;
      revenue: string;
      ordersCount: string;
    }>();

    const productIds = rows.map((row) => row.productId).filter(Boolean);
    const stockMap = await this.loadStockByProductIds(productIds);
    const sparklineMap = await this.loadProductSparklines(productIds, range.end);

    return rows.map((row) => {
      const revenue = round2(toNumber(row.revenue));
      return {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        revenue: formatInr(revenue),
        rawRevenue: revenue,
        ordersCount: toNumber(row.ordersCount),
        conversionRate: '—',
        stockQuantity: stockMap.get(row.productId) ?? 0,
        sparklineTrend: sparklineMap.get(row.productId) ?? [0, 0, 0, 0, 0, 0, 0],
      };
    });
  }

  async getCustomerAnalytics(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const previous = previousPeriodRange(range.start, range.end);

    const [currentCustomers, prevCustomers, currentGuests, prevGuests] = await Promise.all([
      this.customerMetrics(range, false),
      this.customerMetrics(previous, false),
      this.customerMetrics(range, true),
      this.customerMetrics(previous, true),
    ]);
    const [customerSparkline, guestSparkline] = await Promise.all([
      this.customerDailySparkline(range.end, false),
      this.customerDailySparkline(range.end, true),
    ]);

    return {
      customers: this.buildAudienceAnalyticsCards({
        audience: 'customer',
        current: currentCustomers,
        previous: prevCustomers,
        sparkline: customerSparkline,
      }),
      guests: this.buildAudienceAnalyticsCards({
        audience: 'guest',
        current: currentGuests,
        previous: prevGuests,
        sparkline: guestSparkline,
      }),
    };
  }

  private buildAudienceAnalyticsCards(params: {
    audience: 'customer' | 'guest';
    current: {
      newUsers: number;
      repeatUsers: number;
      retentionRate: number;
      repeatPurchaseRate: number;
    };
    previous: {
      newUsers: number;
      repeatUsers: number;
      retentionRate: number;
      repeatPurchaseRate: number;
    };
    sparkline: {
      newUsers: number[];
      repeatUsers: number[];
      retentionRate: number[];
      repeatPurchaseRate: number[];
    };
  }) {
    const isGuest = params.audience === 'guest';
    const noun = isGuest ? 'Guests' : 'Customers';
    const prefix = isGuest ? 'guest' : 'customer';

    return [
      {
        metric: `new_${prefix}s`,
        title: `New ${noun}`,
        value: formatCount(params.current.newUsers),
        change: formatSignedPercent(
          changePercentage(params.current.newUsers, params.previous.newUsers),
        ),
        color: '#3b82f6',
        sparkline: params.sparkline.newUsers,
      },
      {
        metric: `repeat_${prefix}s`,
        title: `Repeat ${noun}`,
        value: formatCount(params.current.repeatUsers),
        change: formatSignedPercent(
          changePercentage(params.current.repeatUsers, params.previous.repeatUsers),
        ),
        color: '#22c55e',
        sparkline: params.sparkline.repeatUsers,
      },
      {
        metric: `${prefix}_retention_rate`,
        title: isGuest ? 'Guest Retention Rate' : 'Retention Rate',
        value: formatPercent(params.current.retentionRate),
        change: formatSignedPercent(
          changePercentage(params.current.retentionRate, params.previous.retentionRate),
        ),
        color: '#8b5cf6',
        sparkline: params.sparkline.retentionRate,
      },
      {
        metric: `${prefix}_repeat_purchase_rate`,
        title: isGuest ? 'Guest Repeat Purchase Rate' : 'Repeat Purchase Rate',
        value: formatPercent(params.current.repeatPurchaseRate),
        change: formatSignedPercent(
          changePercentage(params.current.repeatPurchaseRate, params.previous.repeatPurchaseRate),
        ),
        color: '#f97316',
        sparkline: params.sparkline.repeatPurchaseRate,
      },
    ];
  }

  async getBrandPerformance(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);
    const limit = query.limit ?? 5;

    const qb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin(ProductEntity, 'product', 'product.id = item.productId')
      .innerJoin(BrandEntity, 'brand', 'brand.id = product.brandId')
      .select('brand.id', 'brandId')
      .addSelect('brand.name', 'name')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .groupBy('brand.id')
      .addGroupBy('brand.name')
      .orderBy('revenue', 'DESC')
      .take(limit);

    if (sources?.length) {
      qb.andWhere('order.orderSource IN (:...sources)', { sources });
    }

    const rows = await qb.getRawMany<{ brandId: string; name: string; revenue: string }>();
    return rows.map((row, index) => {
      const revenue = round2(toNumber(row.revenue));
      return {
        brandId: row.brandId,
        name: row.name,
        revenue: formatInr(revenue),
        rawRevenue: revenue,
        color: DASHBOARD_BRAND_COLORS[index % DASHBOARD_BRAND_COLORS.length],
      };
    });
  }

  async getCategoryPerformance(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);

    const qb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin(ProductEntity, 'product', 'product.id = item.productId')
      .innerJoin(CategoryEntity, 'category', 'category.id = product.categoryId')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'name')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .groupBy('category.id')
      .addGroupBy('category.name')
      .orderBy('revenue', 'DESC');

    if (sources?.length) {
      qb.andWhere('order.orderSource IN (:...sources)', { sources });
    }

    const rows = await qb.getRawMany<{ categoryId: string; name: string; revenue: string }>();
    const total = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);
    const top = rows.slice(0, 6);
    const othersRevenue = rows.slice(6).reduce((sum, row) => sum + toNumber(row.revenue), 0);

    const data = top.map((row, index) => {
      const revenue = round2(toNumber(row.revenue));
      const share = total > 0 ? round2((revenue / total) * 100) : 0;
      return {
        name: row.name,
        value: share,
        revenue: formatInr(revenue),
        rawRevenue: revenue,
        color: DASHBOARD_CATEGORY_COLORS[index % DASHBOARD_CATEGORY_COLORS.length],
      };
    });

    if (othersRevenue > 0) {
      data.push({
        name: 'Others',
        value: total > 0 ? round2((othersRevenue / total) * 100) : 0,
        revenue: formatInr(othersRevenue),
        rawRevenue: round2(othersRevenue),
        color: '#94A3B8',
      });
    }

    return data;
  }

  async getSalesChannels(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const qb = this.revenueOrdersQb(range, null)
      .select('order.orderSource', 'channel')
      .addSelect('COALESCE(SUM(order.grandTotal), 0)', 'revenue')
      .addSelect('COUNT(*)', 'orders')
      .groupBy('order.orderSource');

    const rows = await qb.getRawMany<{ channel: OrderSource; revenue: string; orders: string }>();
    const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);

    const channels: OrderSource[] = [
      OrderSource.WEBSITE,
      OrderSource.APP,
      OrderSource.ADMIN,
      OrderSource.GOKWIK,
    ];

    return {
      totalRevenue: round2(totalRevenue),
      totalRevenueFormatted: formatInr(totalRevenue),
      breakdown: channels.map((channel) => {
        const row = rows.find((item) => item.channel === channel);
        const revenue = round2(toNumber(row?.revenue));
        const share = totalRevenue > 0 ? round2((revenue / totalRevenue) * 100) : 0;
        const label =
          channel === OrderSource.WEBSITE
            ? 'Web'
            : channel === OrderSource.APP
              ? 'App'
              : channel === OrderSource.ADMIN
                ? 'Backend Orders'
                : 'GoKwik';
        return {
          name: label,
          channel,
          value: share,
          amount: formatInr(revenue),
          rawAmount: revenue,
          orders: toNumber(row?.orders),
          color: DASHBOARD_CHANNEL_COLORS[channel] ?? '#94A3B8',
        };
      }),
    };
  }

  async getPaymentMethods(query: DashboardQueryDto) {
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);
    const qb = this.revenueOrdersQb(range, sources)
      .select('order.paymentMethod', 'method')
      .addSelect('COALESCE(SUM(order.grandTotal), 0)', 'revenue')
      .groupBy('order.paymentMethod');

    const rows = await qb.getRawMany<{ method: string; revenue: string }>();
    const totalRevenue = rows.reduce((sum, row) => sum + toNumber(row.revenue), 0);

    const breakdown = DASHBOARD_PAYMENT_BUCKETS.map((bucket) => {
      const revenue = round2(
        rows
          .filter((row) => bucket.methods.includes(row.method as never))
          .reduce((sum, row) => sum + toNumber(row.revenue), 0),
      );
      const share = totalRevenue > 0 ? round2((revenue / totalRevenue) * 100) : 0;
      return {
        name: bucket.name,
        value: share,
        amount: formatInr(revenue),
        rawAmount: revenue,
        color: bucket.color,
      };
    }).filter((item) => item.rawAmount > 0 || DASHBOARD_PAYMENT_BUCKETS.length <= 3);

    return {
      totalRevenue: round2(totalRevenue),
      totalRevenueFormatted: formatInr(totalRevenue),
      breakdown,
      meta: {
        note:
          'Online combines Razorpay / Cashfree / GoKwik prepaid. UPI vs Cards split is not stored on orders.',
      },
    };
  }

  async getSearchAnalytics(query: DashboardQueryDto) {
    const limit = query.limit ?? 5;
    return {
      topSearches: [] as Array<{ term: string; count: number }>,
      noResultSearches: [] as Array<{ term: string; count: number }>,
      meta: {
        available: false,
        limit,
        note: 'Search telemetry is not persisted yet. Endpoint returns empty lists until search_logs exists.',
      },
    };
  }

  async getMarketingPerformance(query: DashboardQueryDto) {
    const range = this.resolveRange(query);

    const usageQb = this.dataSource
      .getRepository(CouponUsageEntity)
      .createQueryBuilder('usage')
      .leftJoin(CouponEntity, 'coupon', 'coupon.id = usage.couponId')
      .leftJoin(OrderEntity, 'order', 'order.id = usage.orderId')
      .select('usage.couponId', 'couponId')
      .addSelect('MAX(coupon.code)', 'code')
      .addSelect('MAX(coupon.title)', 'title')
      .addSelect('COUNT(*)', 'orders')
      .addSelect('COALESCE(SUM(usage.discountAmount), 0)', 'discount')
      .addSelect('COALESCE(SUM(order.grandTotal), 0)', 'revenue')
      .where('usage.usedAt BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .groupBy('usage.couponId')
      .orderBy('revenue', 'DESC')
      .take(3);

    const [rows, usageCount, campaignRevenue] = await Promise.all([
      usageQb.getRawMany<{
        couponId: string;
        code: string;
        title: string;
        orders: string;
        discount: string;
        revenue: string;
      }>(),
      this.dataSource
        .getRepository(CouponUsageEntity)
        .createQueryBuilder('usage')
        .where('usage.usedAt BETWEEN :start AND :end', {
          start: range.start,
          end: range.end,
        })
        .getCount(),
      this.dataSource
        .getRepository(CouponUsageEntity)
        .createQueryBuilder('usage')
        .leftJoin(OrderEntity, 'order', 'order.id = usage.orderId')
        .select('COALESCE(SUM(order.grandTotal), 0)', 'revenue')
        .where('usage.usedAt BETWEEN :start AND :end', {
          start: range.start,
          end: range.end,
        })
        .getRawOne<{ revenue: string }>(),
    ]);

    const revenue = round2(toNumber(campaignRevenue?.revenue));

    return {
      stats: [
        {
          label: 'Banner CTR',
          value: '—',
          rawValue: 0,
          available: false,
        },
        {
          label: 'Campaign Revenue',
          value: formatInr(revenue),
          rawValue: revenue,
          available: true,
        },
        {
          label: 'Coupon Usage',
          value: formatCount(usageCount),
          rawValue: usageCount,
          available: true,
        },
      ],
      topCampaigns: rows.map((row) => ({
        campaignName: row.title || row.code || 'Coupon',
        couponCode: row.code,
        ctr: null as number | null,
        orders: toNumber(row.orders),
        revenue: formatInr(toNumber(row.revenue)),
        rawRevenue: round2(toNumber(row.revenue)),
        status: 'Active',
      })),
      meta: {
        note: 'Banner CTR / ad campaigns are not tracked yet. Coupon usage is live from coupon_usages.',
      },
    };
  }

  async getConsultationAnalytics(_query: DashboardQueryDto) {
    return {
      stats: [
        { label: 'Booked', value: '0', rawValue: 0, change: '0%', isPositive: true },
        { label: 'Completed', value: '0', rawValue: 0, change: '0%', isPositive: true },
        { label: 'Cancelled', value: '0', rawValue: 0, change: '0%', isPositive: false },
        { label: 'Revenue', value: formatInr(0), rawValue: 0, change: '0%', isPositive: true },
      ],
      weeklyTrend: this.last7DayLabels(new Date()).map((date) => ({
        date,
        bookings: 0,
      })),
      meta: {
        available: false,
        note: 'Doctor consultation module is not implemented yet.',
      },
    };
  }

  /** View All — paginated top products. */
  async getTopProductsViewAll(query: DashboardViewAllQueryDto) {
    const pagination = buildPaginationOptions({
      page: query.page,
      limit: query.limit ?? 20,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);
    const sortBy = query.sortBy === 'orders' ? 'orders' : 'revenue';

    const baseQb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .select('item.productId', 'productId')
      .addSelect('MAX(item.productName)', 'productName')
      .addSelect('MAX(item.sku)', 'sku')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .addSelect('COUNT(DISTINCT order.id)', 'ordersCount')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .groupBy('item.productId');

    if (sources?.length) {
      baseQb.andWhere('order.orderSource IN (:...sources)', { sources });
    }

    const totalRows = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(`(${baseQb.getQuery()})`, 'grouped')
      .setParameters(baseQb.getParameters())
      .getRawOne<{ total: string }>();
    const total = toNumber(totalRows?.total);

    const rows = await baseQb
      .orderBy(sortBy === 'orders' ? 'ordersCount' : 'revenue', 'DESC')
      .offset((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .getRawMany<{
        productId: string;
        productName: string;
        sku: string;
        revenue: string;
        ordersCount: string;
      }>();

    const productIds = rows.map((row) => row.productId).filter(Boolean);
    const stockMap = await this.loadStockByProductIds(productIds);
    const sparklineMap = await this.loadProductSparklines(productIds, range.end);

    const data = rows.map((row) => {
      const revenue = round2(toNumber(row.revenue));
      return {
        productId: row.productId,
        productName: row.productName,
        sku: row.sku,
        revenue: formatInr(revenue),
        rawRevenue: revenue,
        ordersCount: toNumber(row.ordersCount),
        conversionRate: '—',
        stockQuantity: stockMap.get(row.productId) ?? 0,
        sparklineTrend: sparklineMap.get(row.productId) ?? [0, 0, 0, 0, 0, 0, 0],
      };
    });

    return buildPaginatedResult(data, total, pagination);
  }

  /** View All — paginated recent activities. */
  async getRecentActivitiesViewAll(query: DashboardViewAllQueryDto) {
    const pagination = buildPaginationOptions({
      page: query.page,
      limit: query.limit ?? 20,
    });
    const now = new Date();
    const fetchSize = Math.min(100, Math.max(pagination.limit * pagination.page, pagination.limit));

    const [orders, users] = await Promise.all([
      this.dataSource
        .getRepository(OrderEntity)
        .createQueryBuilder('order')
        .leftJoinAndSelect('order.user', 'user')
        .orderBy('order.createdAt', 'DESC')
        .take(fetchSize)
        .getMany(),
      this.dataSource
        .getRepository(UserEntity)
        .createQueryBuilder('user')
        .where('user.role = :role', { role: UserRole.CUSTOMER })
        .andWhere('user.isGuest = :isGuest', { isGuest: false })
        .orderBy('user.createdAt', 'DESC')
        .take(fetchSize)
        .getMany(),
    ]);

    const activities = [
      ...orders.map((order) => {
        const ts = order.placedAt ?? order.createdAt;
        const isGuest = Boolean(order.user?.isGuest);
        const name =
          [order.user?.firstName, order.user?.lastName].filter(Boolean).join(' ').trim() ||
          order.recipientName ||
          (isGuest ? 'Guest' : 'Customer');
        return {
          id: `order_${order.id}`,
          type: 'ORDER_PLACED' as const,
          title: `Order #${order.orderNumber}`,
          subtitle: `placed by ${name}${isGuest ? ' (guest)' : ''}`,
          timestamp: ts.toISOString(),
          relativeTime: relativeTime(ts, now),
          color: '#3b82f6',
          sortAt: ts.getTime(),
        };
      }),
      ...users.map((user) => {
        const name =
          [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
          user.mobileNumber ||
          'New user';
        return {
          id: `user_${user.id}`,
          type: 'USER_REGISTERED' as const,
          title: 'New user registered',
          subtitle: name,
          timestamp: user.createdAt.toISOString(),
          relativeTime: relativeTime(user.createdAt, now),
          color: '#8b5cf6',
          sortAt: user.createdAt.getTime(),
        };
      }),
    ].sort((a, b) => b.sortAt - a.sortAt);

    const total = activities.length;
    const start = (pagination.page - 1) * pagination.limit;
    const pageItems = activities
      .slice(start, start + pagination.limit)
      .map(({ sortAt: _sortAt, ...rest }) => rest);

    return buildPaginatedResult(pageItems, total, pagination);
  }

  /** View All — paginated brand performance. */
  async getBrandPerformanceViewAll(query: DashboardViewAllQueryDto) {
    const pagination = buildPaginationOptions({
      page: query.page,
      limit: query.limit ?? 20,
    });
    const range = this.resolveRange(query);
    const sources = resolveOrderSources(query.channel);

    const baseQb = this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .innerJoin(ProductEntity, 'product', 'product.id = item.productId')
      .innerJoin(BrandEntity, 'brand', 'brand.id = product.brandId')
      .select('brand.id', 'brandId')
      .addSelect('brand.name', 'name')
      .addSelect('COALESCE(SUM(item.totalPrice), 0)', 'revenue')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .groupBy('brand.id')
      .addGroupBy('brand.name');

    if (sources?.length) {
      baseQb.andWhere('order.orderSource IN (:...sources)', { sources });
    }

    const totalRows = await this.dataSource
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .from(`(${baseQb.getQuery()})`, 'grouped')
      .setParameters(baseQb.getParameters())
      .getRawOne<{ total: string }>();
    const total = toNumber(totalRows?.total);

    const rows = await baseQb
      .orderBy('revenue', 'DESC')
      .offset((pagination.page - 1) * pagination.limit)
      .limit(pagination.limit)
      .getRawMany<{ brandId: string; name: string; revenue: string }>();

    const data = rows.map((row, index) => {
      const revenue = round2(toNumber(row.revenue));
      const absoluteIndex = (pagination.page - 1) * pagination.limit + index;
      return {
        brandId: row.brandId,
        name: row.name,
        revenue: formatInr(revenue),
        rawRevenue: revenue,
        color: DASHBOARD_BRAND_COLORS[absoluteIndex % DASHBOARD_BRAND_COLORS.length],
      };
    });

    return buildPaginatedResult(data, total, pagination);
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private resolveRange(query: DashboardQueryDto): DateRange {
    const end = query.endDate ? new Date(query.endDate) : endOfDay(new Date());
    const start = query.startDate
      ? new Date(query.startDate)
      : startOfDay(new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1)));
    return { start, end };
  }

  private baseOrdersQb(
    range: DateRange,
    sources: OrderSource[] | null,
  ): SelectQueryBuilder<OrderEntity> {
    const qb = this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      });
    if (sources?.length) {
      qb.andWhere('order.orderSource IN (:...sources)', { sources });
    }
    return qb;
  }

  private revenueOrdersQb(
    range: DateRange,
    sources: OrderSource[] | null,
  ): SelectQueryBuilder<OrderEntity> {
    return this.baseOrdersQb(range, sources)
      .andWhere('order.orderStatus NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('order.paymentStatus IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      });
  }

  private async computeKpiSnapshot(
    range: DateRange,
    sources: OrderSource[] | null,
  ): Promise<{
    revenue: number;
    orders: number;
    aov: number;
    customers: number;
    guests: number;
  }> {
    const revenueRow = await this.revenueOrdersQb(range, sources)
      .select('COALESCE(SUM(order.grandTotal), 0)', 'revenue')
      .addSelect('COUNT(*)', 'paidOrders')
      .getRawOne<{ revenue: string; paidOrders: string }>();

    const orders = await this.baseOrdersQb(range, sources).getCount();
    const revenue = round2(toNumber(revenueRow?.revenue));
    const paidOrders = toNumber(revenueRow?.paidOrders);
    const aov = paidOrders > 0 ? round2(revenue / paidOrders) : 0;

    const [customers, guests] = await Promise.all([
      this.countAudienceUsers({ isGuest: false, createdAtTo: range.end }),
      this.countAudienceUsers({ isGuest: true, createdAtTo: range.end }),
    ]);

    return { revenue, orders, aov, customers, guests };
  }

  private async countAudienceUsers(params: {
    isGuest: boolean;
    createdAtFrom?: Date;
    createdAtTo: Date;
  }): Promise<number> {
    const qb = this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .where('user.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('user.isGuest = :isGuest', { isGuest: params.isGuest })
      .andWhere('user.createdAt <= :end', { end: params.createdAtTo });

    if (params.createdAtFrom) {
      qb.andWhere('user.createdAt >= :start', { start: params.createdAtFrom });
    }

    return qb.getCount();
  }

  private async revenueSeries(
    start: Date,
    end: Date,
    trunc: 'month' | 'quarter' | 'year',
    sources: OrderSource[] | null,
  ): Promise<Array<{ bucket: string; revenue: string }>> {
    const expression =
      trunc === 'month'
        ? 'EXTRACT(MONTH FROM COALESCE("order"."placed_at", "order"."created_at"))'
        : trunc === 'quarter'
          ? 'EXTRACT(QUARTER FROM COALESCE("order"."placed_at", "order"."created_at"))'
          : 'EXTRACT(YEAR FROM COALESCE("order"."placed_at", "order"."created_at"))';

    const qb = this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .select(expression, 'bucket')
      .addSelect('COALESCE(SUM("order"."grand_total"), 0)', 'revenue')
      .where('COALESCE("order"."placed_at", "order"."created_at") BETWEEN :start AND :end', {
        start,
        end,
      })
      .andWhere('"order"."order_status" NOT IN (:...excluded)', {
        excluded: REVENUE_EXCLUDED_STATUSES,
      })
      .andWhere('"order"."payment_status" IN (:...paid)', {
        paid: [OrderPaymentStatus.PAID, OrderPaymentStatus.PARTIALLY_PAID],
      })
      .groupBy('bucket')
      .orderBy('bucket', 'ASC');

    if (sources?.length) {
      qb.andWhere('"order"."order_source" IN (:...sources)', { sources });
    }

    return qb.getRawMany<{ bucket: string; revenue: string }>();
  }

  private async loadStockByProductIds(productIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!productIds.length) return map;

    const rows = await this.dataSource
      .getRepository(ProductVariantEntity)
      .createQueryBuilder('variant')
      .select('variant.productId', 'productId')
      .addSelect('COALESCE(SUM(variant.stock), 0)', 'stock')
      .where('variant.productId IN (:...productIds)', { productIds })
      .groupBy('variant.productId')
      .getRawMany<{ productId: string; stock: string }>();

    for (const row of rows) {
      map.set(row.productId, toNumber(row.stock));
    }
    return map;
  }

  private async loadProductSparklines(
    productIds: string[],
    end: Date,
  ): Promise<Map<string, number[]>> {
    const map = new Map<string, number[]>();
    for (const id of productIds) {
      map.set(id, [0, 0, 0, 0, 0, 0, 0]);
    }
    if (!productIds.length) return map;

    const start = startOfDay(addDays(end, -6));
    const rows = await this.dataSource
      .getRepository(OrderItemEntity)
      .createQueryBuilder('item')
      .innerJoin('item.order', 'order')
      .select('item.productId', 'productId')
      .addSelect('DATE(COALESCE(order.placedAt, order.createdAt))', 'day')
      .addSelect('COUNT(DISTINCT order.id)', 'orders')
      .where('item.productId IN (:...productIds)', { productIds })
      .andWhere('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start,
        end: endOfDay(end),
      })
      .groupBy('item.productId')
      .addGroupBy('day')
      .getRawMany<{ productId: string; day: string; orders: string }>();

    const dayKeys = Array.from({ length: 7 }, (_, i) =>
      startOfDay(addDays(start, i)).toISOString().slice(0, 10),
    );

    for (const row of rows) {
      const day = String(row.day).slice(0, 10);
      const idx = dayKeys.indexOf(day);
      if (idx < 0) continue;
      const series = map.get(row.productId) ?? [0, 0, 0, 0, 0, 0, 0];
      series[idx] = toNumber(row.orders);
      map.set(row.productId, series);
    }
    return map;
  }

  private async customerMetrics(
    range: DateRange,
    isGuest: boolean,
  ): Promise<{
    newUsers: number;
    repeatUsers: number;
    retentionRate: number;
    repeatPurchaseRate: number;
  }> {
    const newUsers = await this.countAudienceUsers({
      isGuest,
      createdAtFrom: range.start,
      createdAtTo: range.end,
    });

    const buyerRows = await this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .innerJoin(UserEntity, 'user', 'user.id = order.userId')
      .select('order.userId', 'userId')
      .addSelect('COUNT(*)', 'orderCount')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start: range.start,
        end: range.end,
      })
      .andWhere('order.orderStatus NOT IN (:...cancelled)', {
        cancelled: [OrderStatus.CANCELLED],
      })
      .andWhere('user.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('user.isGuest = :isGuest', { isGuest })
      .groupBy('order.userId')
      .getRawMany<{ userId: string; orderCount: string }>();

    const buyers = buyerRows.length;
    const repeatUsers = buyerRows.filter((row) => toNumber(row.orderCount) > 1).length;
    const retentionRate = buyers > 0 ? round2((repeatUsers / buyers) * 100) : 0;
    const repeatPurchaseRate = buyers > 0 ? round2((repeatUsers / buyers) * 100) : 0;

    return { newUsers, repeatUsers, retentionRate, repeatPurchaseRate };
  }

  private async customerDailySparkline(
    end: Date,
    isGuest: boolean,
  ): Promise<{
    newUsers: number[];
    repeatUsers: number[];
    retentionRate: number[];
    repeatPurchaseRate: number[];
  }> {
    const start = startOfDay(addDays(end, -6));
    const dayKeys = Array.from({ length: 7 }, (_, i) =>
      startOfDay(addDays(start, i)).toISOString().slice(0, 10),
    );

    const newRows = await this.dataSource
      .getRepository(UserEntity)
      .createQueryBuilder('user')
      .select(`TO_CHAR(user.createdAt AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'day')
      .addSelect('COUNT(*)', 'count')
      .where('user.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('user.isGuest = :isGuest', { isGuest })
      .andWhere('user.createdAt BETWEEN :start AND :end', {
        start,
        end: endOfDay(end),
      })
      .groupBy('day')
      .getRawMany<{ day: string; count: string }>();

    const orderRows = await this.dataSource
      .getRepository(OrderEntity)
      .createQueryBuilder('order')
      .innerJoin(UserEntity, 'user', 'user.id = order.userId')
      .select(
        `TO_CHAR(COALESCE(order.placedAt, order.createdAt) AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
        'day',
      )
      .addSelect('order.userId', 'userId')
      .addSelect('COUNT(*)', 'orderCount')
      .where('COALESCE(order.placedAt, order.createdAt) BETWEEN :start AND :end', {
        start,
        end: endOfDay(end),
      })
      .andWhere('order.orderStatus NOT IN (:...cancelled)', {
        cancelled: [OrderStatus.CANCELLED],
      })
      .andWhere('user.role = :role', { role: UserRole.CUSTOMER })
      .andWhere('user.isGuest = :isGuest', { isGuest })
      .groupBy('day')
      .addGroupBy('order.userId')
      .getRawMany<{ day: string; userId: string; orderCount: string }>();

    const newUsers = dayKeys.map((day) => {
      const row = newRows.find((item) => item.day === day);
      return toNumber(row?.count);
    });

    const repeatUsers: number[] = [];
    const retentionRate: number[] = [];
    const repeatPurchaseRate: number[] = [];

    for (const day of dayKeys) {
      const dayBuyers = orderRows.filter((row) => row.day === day);
      const buyers = dayBuyers.length;
      const repeats = dayBuyers.filter((row) => toNumber(row.orderCount) > 1).length;
      const rate = buyers > 0 ? round2((repeats / buyers) * 100) : 0;
      repeatUsers.push(repeats);
      retentionRate.push(rate);
      repeatPurchaseRate.push(rate);
    }

    return { newUsers, repeatUsers, retentionRate, repeatPurchaseRate };
  }

  private last7DayLabels(end: Date): string[] {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(end, -(6 - i));
      return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
    });
  }
}
