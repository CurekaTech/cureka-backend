import { OrderSource } from '../enums/order-source.enum';
import {
  normalizeStorefrontOrderSource,
  resolveStorefrontOrderSource,
} from './storefront-order-source.util';

describe('storefront-order-source.util', () => {
  describe('normalizeStorefrontOrderSource', () => {
    it('maps App aliases case-insensitively', () => {
      expect(normalizeStorefrontOrderSource('App')).toBe(OrderSource.APP);
      expect(normalizeStorefrontOrderSource('APP')).toBe(OrderSource.APP);
      expect(normalizeStorefrontOrderSource(' app ')).toBe(OrderSource.APP);
      expect(normalizeStorefrontOrderSource('android app')).toBe(OrderSource.APP);
    });

    it('maps Website aliases', () => {
      expect(normalizeStorefrontOrderSource('Website')).toBe(OrderSource.WEBSITE);
      expect(normalizeStorefrontOrderSource('web')).toBe(OrderSource.WEBSITE);
    });

    it('returns undefined for empty values', () => {
      expect(normalizeStorefrontOrderSource(undefined)).toBeUndefined();
      expect(normalizeStorefrontOrderSource('')).toBeUndefined();
      expect(normalizeStorefrontOrderSource('   ')).toBeUndefined();
    });
  });

  describe('resolveStorefrontOrderSource', () => {
    it('prefers explicit App over cart Website', () => {
      expect(resolveStorefrontOrderSource(OrderSource.APP, OrderSource.WEBSITE)).toBe(
        OrderSource.APP,
      );
    });

    it('falls back to cart App when body omits source', () => {
      expect(resolveStorefrontOrderSource(undefined, OrderSource.APP)).toBe(OrderSource.APP);
    });

    it('defaults to Website', () => {
      expect(resolveStorefrontOrderSource(undefined, null)).toBe(OrderSource.WEBSITE);
    });
  });
});
