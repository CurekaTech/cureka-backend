import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderSource } from '@modules/orders/enums/order-source.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';

/** Dashboard donut statuses (UI) → underlying Cureka order statuses. */
export const DASHBOARD_ORDER_STATUS_GROUPS: Array<{
  status: string;
  name: string;
  color: string;
  orderStatuses: OrderStatus[];
}> = [
  {
    status: 'PENDING',
    name: 'Placed',
    color: '#4285F4',
    orderStatuses: [OrderStatus.PENDING, OrderStatus.CONFIRMED],
  },
  {
    status: 'PACKED',
    name: 'Packed',
    color: '#FB8C00',
    orderStatuses: [OrderStatus.PROCESSING],
  },
  {
    status: 'SHIPPED',
    name: 'Shipped',
    color: '#9C27B0',
    orderStatuses: [OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY],
  },
  {
    status: 'DELIVERED',
    name: 'Delivered',
    color: '#34A853',
    orderStatuses: [OrderStatus.DELIVERED],
  },
  {
    status: 'CANCELLED',
    name: 'Cancelled',
    color: '#EA4335',
    orderStatuses: [OrderStatus.CANCELLED],
  },
  {
    status: 'RTO',
    name: 'Returned',
    color: '#00ACC1',
    orderStatuses: [OrderStatus.RTO, OrderStatus.FAILED_DELIVERY],
  },
];

export const DASHBOARD_CHANNEL_COLORS: Record<string, string> = {
  Website: '#4285F4',
  App: '#34A853',
  Admin: '#FB8C00',
  GoKwik: '#9C27B0',
};

export const DASHBOARD_PAYMENT_BUCKETS: Array<{
  name: string;
  color: string;
  methods: OrderPaymentMethod[];
}> = [
  {
    name: 'Online',
    color: '#4285F4',
    methods: [
      OrderPaymentMethod.RAZORPAY,
      OrderPaymentMethod.CASHFREE,
      OrderPaymentMethod.GOKWIK_PREPAID,
    ],
  },
  {
    name: 'COD',
    color: '#FB8C00',
    methods: [OrderPaymentMethod.COD, OrderPaymentMethod.GOKWIK_PARTIAL_COD],
  },
  {
    name: 'Wallet',
    color: '#9C27B0',
    methods: [OrderPaymentMethod.WALLET],
  },
];

export const DASHBOARD_CATEGORY_COLORS = [
  '#4285F4',
  '#34A853',
  '#FB8C00',
  '#9C27B0',
  '#00ACC1',
  '#29B6F6',
  '#94A3B8',
];

export const DASHBOARD_BRAND_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f97316',
  '#8b5cf6',
  '#06b6d4',
];

/** Map UI/channel query string → OrderSource values. */
export function resolveOrderSources(channel?: string): OrderSource[] | null {
  if (!channel || channel.toLowerCase() === 'all') return null;
  const normalized = channel.trim().toLowerCase();
  if (normalized === 'web' || normalized === 'website') return [OrderSource.WEBSITE];
  if (normalized === 'android app' || normalized === 'ios app' || normalized === 'app') {
    return [OrderSource.APP];
  }
  if (normalized === 'admin' || normalized === 'backend') return [OrderSource.ADMIN];
  if (normalized === 'gokwik') return [OrderSource.GOKWIK];
  return null;
}

export const REVENUE_EXCLUDED_STATUSES: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.FAILED_DELIVERY,
];
