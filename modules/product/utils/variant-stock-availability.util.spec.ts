import {
  resolveAvailabilityFromDelta,
  resolveAvailabilityFromStock,
  resolveManualInStock,
  resolveManualOutOfStock,
} from './variant-stock-availability.util';

describe('variant-stock-availability.util', () => {
  it('manual OOS zeros stock and flags becameOos when previously INS', () => {
    expect(resolveManualOutOfStock({ stock: 12, outOfStock: false })).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('manual OOS on already-OOS does not flag becameOos', () => {
    expect(resolveManualOutOfStock({ stock: 5, outOfStock: true })).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });

  it('stock > 0 clears OOS', () => {
    expect(resolveAvailabilityFromStock(3, true)).toEqual({
      stock: 3,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('stock 0 sets OOS and flags transition from INS', () => {
    expect(resolveAvailabilityFromStock(0, false)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('order decrement to zero becomes OOS', () => {
    expect(resolveAvailabilityFromDelta({ stock: 2, outOfStock: false }, -2)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('restock from OOS becomes INS', () => {
    expect(resolveAvailabilityFromDelta({ stock: 0, outOfStock: true }, 4)).toEqual({
      stock: 4,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('manual INS with zero stock stays OOS', () => {
    expect(resolveManualInStock({ stock: 0, outOfStock: true })).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });
});
