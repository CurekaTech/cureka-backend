import { allocateReturnAmounts, IAllocatableOrderTotals } from './return-amount-allocation.util';

const totals = (overrides: Partial<IAllocatableOrderTotals> = {}): IAllocatableOrderTotals => ({
  subtotal: '1000.00',
  discountAmount: '0.00',
  shippingAmount: '0.00',
  handlingAmount: '0.00',
  codCharge: '0.00',
  prepaidDiscount: '0.00',
  ...overrides,
});

describe('allocateReturnAmounts', () => {
  it('returns the full line value when there are no order-level reductions', () => {
    const [line] = allocateReturnAmounts(totals(), [
      {
        orderItemId: 'item-1',
        lineTotal: '400.00',
        returnQuantity: 2,
        orderedQuantity: 2,
        unitPrice: '200.00',
      },
    ]);

    expect(line.grossAmount).toBe(400);
    expect(line.netAmount).toBe(400);
  });

  it('prorates a partial-quantity return by ordered quantity', () => {
    const [line] = allocateReturnAmounts(totals(), [
      {
        orderItemId: 'item-1',
        lineTotal: '400.00',
        returnQuantity: 1,
        orderedQuantity: 4,
        unitPrice: '100.00',
      },
    ]);

    expect(line.grossAmount).toBe(100);
    expect(line.netAmount).toBe(100);
  });

  it('spreads an order-level discount proportionally across returned lines', () => {
    const lines = allocateReturnAmounts(totals({ discountAmount: '100.00' }), [
      {
        orderItemId: 'item-1',
        lineTotal: '600.00',
        returnQuantity: 1,
        orderedQuantity: 1,
        unitPrice: '600.00',
      },
      {
        orderItemId: 'item-2',
        lineTotal: '400.00',
        returnQuantity: 1,
        orderedQuantity: 1,
        unitPrice: '400.00',
      },
    ]);

    expect(lines[0].discountAllocation).toBe(60);
    expect(lines[1].discountAllocation).toBe(40);
    expect(lines[0].netAmount).toBe(540);
    expect(lines[1].netAmount).toBe(360);
  });

  it('only charges the returned share of the discount when part of the order is kept', () => {
    const [line] = allocateReturnAmounts(totals({ discountAmount: '100.00' }), [
      {
        orderItemId: 'item-1',
        lineTotal: '600.00',
        returnQuantity: 1,
        orderedQuantity: 3,
        unitPrice: '200.00',
      },
    ]);

    expect(line.grossAmount).toBe(200);
    expect(line.discountAllocation).toBe(20);
    expect(line.netAmount).toBe(180);
  });

  it('deducts the prepaid discount as well as the order discount', () => {
    const [line] = allocateReturnAmounts(
      totals({ discountAmount: '100.00', prepaidDiscount: '50.00' }),
      [
        {
          orderItemId: 'item-1',
          lineTotal: '1000.00',
          returnQuantity: 1,
          orderedQuantity: 1,
          unitPrice: '1000.00',
        },
      ],
    );

    expect(line.discountAllocation).toBe(100);
    expect(line.prepaidDiscountAllocation).toBe(50);
    expect(line.netAmount).toBe(850);
  });

  it('never allocates more discount than the order actually carried', () => {
    const lines = allocateReturnAmounts(
      totals({ subtotal: '100.00', discountAmount: '33.33' }),
      Array.from({ length: 3 }, (_, index) => ({
        orderItemId: `item-${index}`,
        lineTotal: '33.34',
        returnQuantity: 1,
        orderedQuantity: 1,
        unitPrice: '33.34',
      })),
    );

    const allocated = lines.reduce((sum, line) => sum + line.discountAllocation, 0);
    expect(allocated).toBeLessThanOrEqual(33.33);
  });

  it('never produces a negative refund when the discount exceeds the line value', () => {
    const [line] = allocateReturnAmounts(
      totals({ subtotal: '100.00', discountAmount: '100.00', prepaidDiscount: '50.00' }),
      [
        {
          orderItemId: 'item-1',
          lineTotal: '100.00',
          returnQuantity: 1,
          orderedQuantity: 1,
          unitPrice: '100.00',
        },
      ],
    );

    expect(line.netAmount).toBe(0);
  });

  it('reports coupon value inside the discount allocation rather than double counting it', () => {
    const [line] = allocateReturnAmounts(totals({ discountAmount: '200.00' }), [
      {
        orderItemId: 'item-1',
        lineTotal: '1000.00',
        returnQuantity: 1,
        orderedQuantity: 1,
        unitPrice: '1000.00',
      },
    ]);

    expect(line.couponAllocation).toBe(0);
    expect(line.discountAllocation).toBe(200);
  });
});
