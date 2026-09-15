import {
  MAX_SKU_SEQUENCE,
  buildSkuPrefix,
  findMaxSkuSequenceForPrefix,
  formatGeneratedSku,
} from './bulk-upload-variable.util';

const nextSkuForPrefix = (prefix: string, existingSkus: string[]): string => {
  const sequence = findMaxSkuSequenceForPrefix(prefix, existingSkus) + 1;
  return formatGeneratedSku(prefix, sequence);
};

describe('auto-generated SKU sequence (5 digits)', () => {
  const prefix = buildSkuPrefix('Herbal', 'Zinc');

  it('builds CAT/BRA/ prefix from category and brand names', () => {
    expect(prefix).toBe('HER/ZIN/');
    expect(buildSkuPrefix('Vitamins', 'Deccan')).toBe('VIT/DEC/');
  });

  it('starts from 00001 when no existing SKU for the prefix', () => {
    expect(findMaxSkuSequenceForPrefix(prefix, [])).toBe(0);
    expect(nextSkuForPrefix(prefix, [])).toBe('HER/ZIN/00001');
  });

  it('treats legacy 3-digit 001 as sequence 1 and next is 00002', () => {
    expect(findMaxSkuSequenceForPrefix('VIT/DEC/', ['VIT/DEC/001'])).toBe(1);
    expect(nextSkuForPrefix('VIT/DEC/', ['VIT/DEC/001'])).toBe('VIT/DEC/00002');
  });

  it('increments from existing 00099 to 00100', () => {
    expect(findMaxSkuSequenceForPrefix('VIT/DEC/', ['VIT/DEC/00099'])).toBe(99);
    expect(nextSkuForPrefix('VIT/DEC/', ['VIT/DEC/00099'])).toBe('VIT/DEC/00100');
  });

  it('increments from existing 08944 to 08945', () => {
    expect(findMaxSkuSequenceForPrefix(prefix, ['HER/ZIN/08944'])).toBe(8944);
    expect(nextSkuForPrefix(prefix, ['HER/ZIN/08944'])).toBe('HER/ZIN/08945');
  });

  it('uses the highest sequence among multiple SKUs with the same prefix', () => {
    const existing = ['VIT/DEC/001', 'VIT/DEC/050', 'VIT/DEC/00099', 'VIT/DEC/00012'];
    expect(findMaxSkuSequenceForPrefix('VIT/DEC/', existing)).toBe(99);
    expect(nextSkuForPrefix('VIT/DEC/', existing)).toBe('VIT/DEC/00100');
  });

  it('ignores SKUs from other prefixes when finding the max', () => {
    const existing = ['HER/ZIN/00010', 'VIT/DEC/08944', 'SUP/NES/99999'];
    expect(findMaxSkuSequenceForPrefix('VIT/DEC/', existing)).toBe(8944);
    expect(nextSkuForPrefix('VIT/DEC/', existing)).toBe('VIT/DEC/08945');
  });

  it('handles mixed legacy 3-digit and 5-digit SKUs', () => {
    const existing = ['VIT/DEC/001', 'VIT/DEC/002', 'VIT/DEC/00015'];
    expect(findMaxSkuSequenceForPrefix('VIT/DEC/', existing)).toBe(15);
    expect(nextSkuForPrefix('VIT/DEC/', existing)).toBe('VIT/DEC/00016');
  });

  it('does not overwrite a manually provided SKU — only reserved sequences bump the next auto value', () => {
    // Callers pass manually provided SKUs into the existing set so auto-gen skips them.
    const reservedManual = 'HER/ZIN/00005';
    const existing = ['HER/ZIN/00001', reservedManual];
    expect(findMaxSkuSequenceForPrefix(prefix, existing)).toBe(5);
    expect(nextSkuForPrefix(prefix, existing)).toBe('HER/ZIN/00006');
    expect(reservedManual).toBe('HER/ZIN/00005');
  });

  it('throws when the next sequence would exceed 99999', () => {
    expect(findMaxSkuSequenceForPrefix(prefix, ['HER/ZIN/99999'])).toBe(99999);
    expect(() => nextSkuForPrefix(prefix, ['HER/ZIN/99999'])).toThrow(
      /SKU sequence must be an integer between 1 and 99999/,
    );
    expect(MAX_SKU_SEQUENCE).toBe(99999);
  });

  it('formats sequences as exactly 5 digits', () => {
    expect(formatGeneratedSku(prefix, 1)).toBe('HER/ZIN/00001');
    expect(formatGeneratedSku(prefix, 2)).toBe('HER/ZIN/00002');
    expect(formatGeneratedSku(prefix, 3)).toBe('HER/ZIN/00003');
    expect(formatGeneratedSku(prefix, 99)).toBe('HER/ZIN/00099');
    expect(formatGeneratedSku(prefix, 100)).toBe('HER/ZIN/00100');
    expect(formatGeneratedSku(prefix, 8945)).toBe('HER/ZIN/08945');
    expect(formatGeneratedSku(prefix, 99999)).toBe('HER/ZIN/99999');
  });

  it('ignores non-numeric suffixes under the same prefix', () => {
    expect(
      findMaxSkuSequenceForPrefix(prefix, ['HER/ZIN/CUSTOM', 'HER/ZIN/00007-X', 'HER/ZIN/00003']),
    ).toBe(3);
  });
});
