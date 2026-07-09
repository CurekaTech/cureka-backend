import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import {
  formatUnicommerceOrderDate,
  mapOrderToUnicommercePayload,
} from './unicommerce-order.mapper';

function buildOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  const item: Partial<OrderItemEntity> = {
    refId: 'OI200001',
    productId: 'prod-uuid-1',
    variantId: 'variant-uuid-1',
    sku: 'SKU-001',
    productName: 'Vitamin C Serum',
    variantName: '30ml',
    quantity: 2,
    unitPrice: '499.00',
    totalPrice: '998.00',
    product: { refId: 'PRD20260001' } as OrderItemEntity['product'],
  };

  return {
    orderNumber: 'ORD123456780001',
    subtotal: '998.00',
    discountAmount: '50.00',
    shippingAmount: '40.00',
    codCharge: '20.00',
    grandTotal: '1008.00',
    paymentMethod: OrderPaymentMethod.RAZORPAY,
    paymentStatus: OrderPaymentStatus.PAID,
    orderStatus: OrderStatus.CONFIRMED,
    recipientName: 'Jane Doe',
    phoneNumber: '9876543210',
    pincode: '600001',
    addressLine1: '12 MG Road',
    addressLine2: 'Near Park',
    city: 'Chennai',
    state: 'Tamil Nadu',
    notes: 'Leave at door',
    placedAt: new Date('2026-07-09T05:00:00.000Z'),
    createdAt: new Date('2026-07-09T05:00:00.000Z'),
    user: { email: 'jane@example.com' } as OrderEntity['user'],
    items: [item as OrderItemEntity],
    ...overrides,
  } as OrderEntity;
}

describe('unicommerce-order.mapper', () => {
  it('formats dates as yyyy-MM-dd HH:mm:ss', () => {
    expect(formatUnicommerceOrderDate(new Date('2026-07-09T05:06:07.000Z'))).toBe(
      '2026-07-09 05:06:07',
    );
  });

  it('maps a prepaid order to UniCommerce payload', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder(), {
      facilityCode: 'WH-01',
      currency: 'INR',
      slaHours: 48,
    });

    expect(payload.id).toBe('ORD123456780001');
    expect(payload.displayOrderNumber).toBe('ORD123456780001');
    expect(payload.orderStatus).toBe('CREATED');
    expect(payload.paymentType).toBe('PREPAID');
    expect(payload.orderDate).toBe('2026-07-09 05:00:00');
    expect(payload.sla).toBe('2026-07-11 05:00:00');
    expect(payload.orderPrice.totalPrepaidAmount).toBe(1008);
    expect(payload.orderPrice.totalCashOnDeliveryCharges).toBe(0);
    expect(payload.orderPrice.totalDiscount).toBe(50);
    expect(payload.orderPrice.totalShippingCharges).toBe(40);

    expect(payload.orderItems).toHaveLength(1);
    const item = payload.orderItems[0];
    expect(item.orderItemId).toBe('OI200001');
    expect(item.productId).toBe('PRD20260001');
    expect(item.variantId).toBe('SKU-001');
    expect(item.sku).toBe('SKU-001');
    expect(item.title).toBe('Vitamin C Serum (30ml)');
    expect(item.quantity).toBe(2);
    expect(item.orderItemPrice.sellingPrice).toBe(499);
    expect(item.orderItemPrice.totalPrice).toBe(998);
    expect(item.facilityCode).toBe('WH-01');

    expect(payload.shippingAddress).toEqual(payload.billingAddress);
    expect(payload.shippingAddress.email).toBe('jane@example.com');
    expect(payload.shippingAddress.country).toBe('India');
    expect(payload.additionalInfo).toBe('Leave at door');
  });

  it('maps COD orders with COD charges and no prepaid amount', () => {
    const payload = mapOrderToUnicommercePayload(
      buildOrder({ paymentMethod: OrderPaymentMethod.COD }),
    );

    expect(payload.paymentType).toBe('COD');
    expect(payload.orderPrice.totalCashOnDeliveryCharges).toBe(20);
    expect(payload.orderPrice.totalPrepaidAmount).toBe(0);
  });

  it('maps cancelled orders to CANCELLED status for order and items', () => {
    const payload = mapOrderToUnicommercePayload(
      buildOrder({ orderStatus: OrderStatus.CANCELLED }),
    );

    expect(payload.orderStatus).toBe('CANCELLED');
    expect(payload.orderItems[0].status).toBe('CANCELLED');
  });

  it('falls back to internal productId when product relation missing', () => {
    const order = buildOrder();
    order.items[0].product = undefined;
    const payload = mapOrderToUnicommercePayload(order);
    expect(payload.orderItems[0].productId).toBe('prod-uuid-1');
  });
});
