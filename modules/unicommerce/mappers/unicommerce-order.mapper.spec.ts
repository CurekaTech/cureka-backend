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
    handlingAmount: '0.00',
    platformFee: '0.00',
    prepaidDiscount: '0.00',
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

    // quantity=2 → Unicommerce needs 2 single-unit rows
    expect(so.saleOrderItems).toHaveLength(2);
    expect(so.saleOrderItems[0].code).toBe('ORD123456780001-1');
    expect(so.saleOrderItems[0].itemSku).toBe('SKU-001');
    expect(so.saleOrderItems[0].shippingMethodCode).toBe('STD');
    expect(so.saleOrderItems[0].sellingPrice).toBe('499.00');
    expect(so.saleOrderItems[0].totalPrice).toBe('499.00');
    expect(so.saleOrderItems[0].prepaidAmount).toBe('499.00');
    expect(so.saleOrderItems[0].giftWrap).toBe(false);

    expect(so.saleOrderItems[1].code).toBe('ORD123456780001-2');
    expect(so.saleOrderItems[1].sellingPrice).toBe('499.00');
    expect(so.saleOrderItems[1].totalPrice).toBe('499.00');
  });

  it('expands quantity into one Unicommerce saleOrderItem per unit', () => {
    const payload = mapOrderToUnicommercePayload(
      buildOrder({
        items: [
          {
            sku: 'WEL/CET/14253',
            productName: 'Cetaphil Baby Mild Bar 100gm',
            variantName: null,
            quantity: 5,
            unitPrice: '192.20',
            totalPrice: '961.00',
          } as OrderItemEntity,
        ],
        subtotal: '961.00',
        discountAmount: '99.00',
        shippingAmount: '0.00',
        grandTotal: '961.00',
        paymentMethod: OrderPaymentMethod.COD,
      }),
    );
    const so = payload.saleOrder;

    expect(so.saleOrderItems).toHaveLength(5);
    expect(so.saleOrderItems.map((i) => i.code)).toEqual([
      'ORD123456780001-1',
      'ORD123456780001-2',
      'ORD123456780001-3',
      'ORD123456780001-4',
      'ORD123456780001-5',
    ]);
    for (const item of so.saleOrderItems) {
      expect(item.itemSku).toBe('WEL/CET/14253');
      expect(item.sellingPrice).toBe('192.20');
      expect(item.totalPrice).toBe('192.20');
      expect(item.prepaidAmount).toBe('0.00');
    }
    expect(so.totalDiscount).toBe(99);
    expect(so.cashOnDelivery).toBe(true);
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
    expect(so.saleOrderItems[0].prepaidAmount).toBe('0.00');
  });

  it('folds handling and platform fees into totalShippingCharges so UC order amount matches', () => {
    const payload = mapOrderToUnicommercePayload(
      buildOrder({
        items: [
          {
            sku: 'NUT/SOG/13665',
            productName: 'So Good Soy Beverage Unsweetened (200 ml)',
            variantName: null,
            quantity: 4,
            unitPrice: '40.00',
            totalPrice: '160.00',
          } as OrderItemEntity,
        ],
        subtotal: '160.00',
        discountAmount: '0.00',
        shippingAmount: '75.00',
        handlingAmount: '50.00',
        platformFee: '50.00',
        codCharge: '0.00',
        grandTotal: '335.00',
        paymentMethod: OrderPaymentMethod.COD,
      }),
    );
    const so = payload.saleOrder;

    expect(so.saleOrderItems).toHaveLength(4);
    // 75 shipping + 50 handling + 50 platform
    expect(so.totalShippingCharges).toBe(175);
    expect(so.totalDiscount).toBe(0);
    expect(so.totalCashOnDeliveryCharges).toBe(0);
    // Items 160 + charges 175 = 335 (matches website grandTotal)
    const itemsTotal = so.saleOrderItems.reduce(
      (sum, item) => sum + Number(item.totalPrice),
      0,
    );
    expect(itemsTotal + so.totalShippingCharges!).toBe(335);
  });

  it('defaults channel to CUSTOM when no options given', () => {
    const payload = mapOrderToUnicommercePayload(buildOrder());
    expect(payload.saleOrder.channel).toBe('CUSTOM');
  });
});
