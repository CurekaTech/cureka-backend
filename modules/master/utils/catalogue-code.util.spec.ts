import { allocateCatalogueCode } from './catalogue-code.util';

describe('allocateCatalogueCode', () => {
  it('uses the first 3 letters', () => {
    expect(allocateCatalogueCode('Himalaya Herbals', new Set(), 'GEN')).toBe('HIM');
    expect(allocateCatalogueCode('Healthwise', new Set(), 'GEN')).toBe('HEA');
    expect(allocateCatalogueCode('HP', new Set(), 'GEN')).toBe('HPX');
  });

  it('uses the first and last letter when the first 3 letters are taken', () => {
    const taken = new Set(['HEA']);
    expect(allocateCatalogueCode('healthetc', taken, 'GEN')).toBe('HCX');
  });

  it('gives 3M and 4M different padded codes', () => {
    const taken = new Set<string>();
    const first = allocateCatalogueCode('3M', taken, 'GEN');
    taken.add(first);
    const second = allocateCatalogueCode('4M', taken, 'GEN');
    taken.add(second);
    const third = allocateCatalogueCode('5M', taken, 'GEN');
    taken.add(third);
    const fourth = allocateCatalogueCode('6M', taken, 'GEN');

    expect(first).toBe('MXX');
    expect(second).toBe('MXY');
    expect(third).toBe('MXZ');
    expect(fourth).toBe('MYY');
  });

  it('does not reuse a code already given to a category', () => {
    expect(allocateCatalogueCode('Healthwise', new Set(['HEA']), 'GEN')).not.toBe('HEA');
  });
});
