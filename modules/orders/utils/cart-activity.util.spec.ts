import { CartEntity } from '../entities/cart.entity';
import { resolveCartCustomerActivityAt } from './cart-activity.util';

describe('resolveCartCustomerActivityAt', () => {
  const base = {
    updatedAt: new Date('2026-09-10T10:00:00.000Z'),
    createdAt: new Date('2026-09-10T09:00:00.000Z'),
    items: [
      { updatedAt: new Date('2026-09-10T10:05:00.000Z'), createdAt: new Date('2026-09-10T09:30:00.000Z') },
    ],
  } as CartEntity;

  it('prefers lastCustomerActivityAt over cart/item updatedAt', () => {
    const dedicated = new Date('2026-09-10T11:00:00.000Z');
    const result = resolveCartCustomerActivityAt({
      ...base,
      lastCustomerActivityAt: dedicated,
    } as CartEntity);
    expect(result.toISOString()).toBe(dedicated.toISOString());
  });

  it('falls back to the latest cart or item timestamp for legacy rows', () => {
    const result = resolveCartCustomerActivityAt({
      ...base,
      lastCustomerActivityAt: null,
    } as CartEntity);
    expect(result.toISOString()).toBe('2026-09-10T10:05:00.000Z');
  });
});
