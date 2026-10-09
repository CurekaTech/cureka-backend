import {
  collapseIdenticalSkuRows,
  decideCodProductSync,
  normalizeReturnWrite,
  parseOptionalNonNegativeInt,
  parseSheetBoolean,
  returnWriteKey,
} from './commerce-sheet.util';

describe('commerce sheet rules', () => {
  it('accepts true/false and yes/no and rejects every other boolean', () => {
    expect(parseSheetBoolean(' TRUE ')).toBe(true);
    expect(parseSheetBoolean('yes')).toBe(true);
    expect(parseSheetBoolean('False')).toBe(false);
    expect(parseSheetBoolean('NO')).toBe(false);
    expect(parseSheetBoolean('1')).toBeNull();
    expect(parseSheetBoolean('')).toBeNull();
    expect(parseSheetBoolean('maybe')).toBeNull();
  });

  it('accepts an empty window or a non-negative integer', () => {
    expect(parseOptionalNonNegativeInt('')).toBeNull();
    expect(parseOptionalNonNegativeInt('0')).toBe(0);
    expect(parseOptionalNonNegativeInt('7')).toBe(7);
    expect(parseOptionalNonNegativeInt('-1')).toBe('invalid');
    expect(parseOptionalNonNegativeInt('7.5')).toBe('invalid');
  });

  it('keeps one identical SKU row and rejects every conflicting row', () => {
    const collapsed = collapseIdenticalSkuRows(
      [
        { sku: 'HER/ZIN/08945', codAvailable: true },
        { sku: 'HER/ZIN/08945', codAvailable: true },
        { sku: 'her/zin/08945', codAvailable: false },
        { sku: 'ABC', codAvailable: true },
        { sku: 'ABC', codAvailable: false },
      ],
      (row) => row.sku,
      (left, right) => left.codAvailable === right.codAvailable,
    );

    expect(collapsed.identicalDuplicateRows).toBe(1);
    expect(collapsed.rows.map((row) => row.sku)).toEqual(['HER/ZIN/08945', 'her/zin/08945']);
    expect(collapsed.conflicts.map((row) => row.sku)).toEqual(['ABC', 'ABC']);
  });

  it('syncs product COD only when every variant is included with the same value', () => {
    expect(
      decideCodProductSync(
        ['v1', 'v2'],
        [
          { variantId: 'v1', codAvailable: true },
          { variantId: 'v2', codAvailable: true },
        ],
      ),
    ).toEqual({ decision: 'sync', value: true });

    expect(
      decideCodProductSync(['v1', 'v2'], [{ variantId: 'v1', codAvailable: false }]),
    ).toEqual({ decision: 'partial' });

    expect(
      decideCodProductSync(
        ['v1', 'v2'],
        [
          { variantId: 'v1', codAvailable: true },
          { variantId: 'v2', codAvailable: false },
        ],
      ),
    ).toEqual({ decision: 'conflict' });
  });

  it('clears return and replacement text when those flags are off', () => {
    const disabled = normalizeReturnWrite({
      returnAllowed: false,
      returnPolicy: '7 day return',
      returnWindowDays: 7,
      replaceAllowed: false,
      replaceWindowDays: 7,
      refundAllowed: false,
    });
    expect(disabled).toEqual({
      returnAllowed: false,
      returnPolicy: null,
      returnWindowDays: null,
      replaceAllowed: false,
      replaceWindowDays: null,
      refundAllowed: false,
    });

    const enabled = normalizeReturnWrite({
      returnAllowed: true,
      returnPolicy: '  ',
      returnWindowDays: null,
      replaceAllowed: true,
      replaceWindowDays: null,
      refundAllowed: true,
    });
    expect(returnWriteKey(enabled)).toContain('"returnPolicy":null');
    expect(enabled.returnWindowDays).toBeNull();
  });
});
