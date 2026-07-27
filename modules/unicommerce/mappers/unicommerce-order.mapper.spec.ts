import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderItemEntity } from '@modules/orders/entities/order-item.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { OrderStatus } from '@modules/orders/enums/order-status.enum';
import { mapOrderToUnicommercePayload } from './unicommerce-order.mapper';

function buildOrder(overrides: Partial<OrderEntity> = {}): OrderEntity {
  const item: Partial<OrderItemEntity> = {
    sku: 'SKU-001',
    productName: 'Vitamin C Serum',
    variantName: '30ml',
    quantity: 2,
    unitPrice: '499.00',
    totalPrice: '998.00',
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

describe('mapOrderToUnicommercePayload', () => {
  it('maps a prepaid order to the official saleOrder payload', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder(), { currency: 'INR', channel: 'CUSTOM' });
    const so = payload.saleOrder;

    expect(so.code).toBe('ORD123456780001');
    expect(so.displayOrderCode).toBe('ORD123456780001');
    expect(so.channel).toBe('CUSTOM');
    expect(so.cashOnDelivery).toBe(false);
    expect(so.paymentInstrument).toBe('NET_BANKING');
    expect(so.currencyCode).toBe('INR');
    expect(so.totalDiscount).toBe(50);
    expect(so.totalShippingCharges).toBe(40);
    expect(so.totalPrepaidAmount).toBe(1008);
    expect(so.totalCashOnDeliveryCharges).toBe(0);
  });

  it('sets the correct address with shipping and billing referencing the same address', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder());
    const so = payload.saleOrder;

    expect(so.addresses).toHaveLength(1);
    const addr = so.addresses[0];
    expect(addr.id).toBe('shipping');
    expect(addr.name).toBe('Jane Doe');
    expect(addr.addressLine1).toBe('12 MG Road');
    expect(addr.addressLine2).toBe('Near Park');
    expect(addr.city).toBe('Chennai');
    expect(addr.state).toBe('Tamil Nadu');
    expect(addr.country).toBe('India');
    expect(addr.pincode).toBe('600001');
    expect(addr.phone).toBe('9876543210');
    expect(addr.email).toBe('jane@example.com');

    expect(so.billingAddress).toEqual({ referenceId: 'shipping' });
    expect(so.shippingAddress).toEqual({ referenceId: 'shipping' });
  });

  it('maps sale order items with correct codes and prices', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder());
    const so = payload.saleOrder;

    expect(so.saleOrderItems).toHaveLength(1);
    const item = so.saleOrderItems[0];
    expect(item.code).toBe('ORD123456780001-1');
    expect(item.itemSku).toBe('SKU-001');
    expect(item.shippingMethodCode).toBe('STD');
    expect(item.sellingPrice).toBe('499');
    expect(item.totalPrice).toBe('998');
    expect(item.prepaidAmount).toBe('998');
    expect(item.giftWrap).toBe(false);
  });

  it('maps COD orders: cashOnDelivery=true, prepaidAmount=0', () => {
    const payload = mapOrderToUnicommercePayload(
      buildOrder({ paymentMethod: OrderPaymentMethod.COD }),
    );
    const so = payload.saleOrder;

    expect(so.cashOnDelivery).toBe(true);
    expect(so.paymentInstrument).toBe('CASH');
    expect(so.totalCashOnDeliveryCharges).toBe(20);
    expect(so.totalPrepaidAmount).toBe(0);
    expect(so.saleOrderItems[0].prepaidAmount).toBe('0');
  });

  it('defaults channel to CUSTOM when no options given', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder());
    expect(payload.saleOrder.channel).toBe('CUSTOM');
  });
});
