import {
  resolveAvailabilityFromAdminDto,
  resolveAvailabilityFromDelta,
  resolveAvailabilityFromStock,
  resolveManualInStock,
  resolveManualOutOfStock,
  resolveRestoreStock,
} from './variant-stock-availability.util';

const managed = { managementEnabled: true } as const;
const flagOnly = { managementEnabled: false } as const;

describe('variant-stock-availability.util (managed)', () => {
  it('manual OOS zeros stock and flags becameOos when previously INS', () => {
    expect(resolveManualOutOfStock({ stock: 12, outOfStock: false }, managed)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('manual OOS on already-OOS does not flag becameOos', () => {
    expect(resolveManualOutOfStock({ stock: 5, outOfStock: true }, managed)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });

  it('stock > 0 clears OOS', () => {
    expect(resolveAvailabilityFromStock(3, true, managed)).toEqual({
      stock: 3,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('stock 0 sets OOS and flags transition from INS', () => {
    expect(resolveAvailabilityFromStock(0, false, managed)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('order decrement to zero becomes OOS', () => {
    expect(resolveAvailabilityFromDelta({ stock: 2, outOfStock: false }, -2, managed)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('restock from OOS becomes INS', () => {
    expect(resolveAvailabilityFromDelta({ stock: 0, outOfStock: true }, 4, managed)).toEqual({
      stock: 4,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('manual INS with zero stock stays OOS', () => {
    expect(resolveManualInStock({ stock: 0, outOfStock: true }, undefined, managed)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });
});

describe('variant-stock-availability.util (flag-only)', () => {
  it('manual OOS keeps stock and flags becameOos', () => {
    expect(resolveManualOutOfStock({ stock: 12, outOfStock: false }, flagOnly)).toEqual({
      stock: 12,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('stock 0 does not flip flag or email', () => {
    expect(resolveAvailabilityFromStock(0, false, flagOnly)).toEqual({
      stock: 0,
      outOfStock: false,
      becameOos: false,
      becameIns: false,
    });
  });

  it('order decrement to zero does not flip flag', () => {
    expect(resolveAvailabilityFromDelta({ stock: 2, outOfStock: false }, -2, flagOnly)).toEqual({
      stock: 0,
      outOfStock: false,
      becameOos: false,
      becameIns: false,
    });
  });

  it('restock does not clear OOS flag', () => {
    expect(resolveAvailabilityFromDelta({ stock: 0, outOfStock: true }, 4, flagOnly)).toEqual({
      stock: 4,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });

  it('manual INS clears flag even at zero stock', () => {
    expect(resolveManualInStock({ stock: 0, outOfStock: true }, undefined, flagOnly)).toEqual({
      stock: 0,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('admin dto stock 0 + outOfStock true (FE-coupled) keeps previous INS', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 5, outOfStock: false },
        { stock: 0, outOfStock: true },
        flagOnly,
      ),
    ).toEqual({
      stock: 0,
      outOfStock: false,
      becameOos: false,
      becameIns: false,
    });
  });

  it('admin dto stock > 0 + outOfStock false (FE-coupled) keeps previous OOS', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 0, outOfStock: true },
        { stock: 25, outOfStock: false },
        flagOnly,
      ),
    ).toEqual({
      stock: 25,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });

  it('admin dto honors divergent outOfStock true with positive stock', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 12, outOfStock: false },
        { stock: 12, outOfStock: true },
        flagOnly,
      ),
    ).toEqual({
      stock: 12,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('admin dto honors divergent outOfStock false at zero stock', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 0, outOfStock: true },
        { stock: 0, outOfStock: false },
        flagOnly,
      ),
    ).toEqual({
      stock: 0,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('admin dto stock-only write does not clear OOS', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 0, outOfStock: true },
        { stock: 10 },
        flagOnly,
      ),
    ).toEqual({
      stock: 10,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });

  it('restore stock > 0 clears OOS flag', () => {
    expect(resolveRestoreStock({ stock: 0, outOfStock: true }, 25, flagOnly)).toEqual({
      stock: 25,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });

  it('restore stock 0 leaves previous OOS flag', () => {
    expect(resolveRestoreStock({ stock: 0, outOfStock: true }, 0, flagOnly)).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: false,
      becameIns: false,
    });
  });
});

describe('variant-stock-availability.util (admin dto managed)', () => {
  it('admin dto stock 0 + outOfStock true marks OOS', () => {
    expect(
      resolveAvailabilityFromAdminDto(
        { stock: 5, outOfStock: false },
        { stock: 0, outOfStock: true },
        managed,
      ),
    ).toEqual({
      stock: 0,
      outOfStock: true,
      becameOos: true,
      becameIns: false,
    });
  });

  it('restore stock > 0 clears OOS', () => {
    expect(resolveRestoreStock({ stock: 0, outOfStock: true }, 25, managed)).toEqual({
      stock: 25,
      outOfStock: false,
      becameOos: false,
      becameIns: true,
    });
  });
});
