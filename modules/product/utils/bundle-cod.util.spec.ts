import { deriveBundleCodAvailable } from './bundle-cod.util';

describe('deriveBundleCodAvailable', () => {
  it('allows COD only when every component variant allows COD', () => {
    expect(deriveBundleCodAvailable([{ codAvailable: true }, { codAvailable: true }])).toBe(true);
  });

  it('blocks COD when any component variant disallows COD', () => {
    expect(deriveBundleCodAvailable([{ codAvailable: true }, { codAvailable: false }])).toBe(false);
  });

  it('blocks COD when the component list is empty', () => {
    expect(deriveBundleCodAvailable([])).toBe(false);
  });

  it('blocks COD when a component flag is missing', () => {
    expect(deriveBundleCodAvailable([{ codAvailable: true }, {}])).toBe(false);
  });
});
