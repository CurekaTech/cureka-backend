import { parseCartLookupId } from './cart-lookup-id.util';

describe('parseCartLookupId', () => {
  it('accepts a cart UUID', () => {
    expect(parseCartLookupId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toEqual({
      kind: 'uuid',
      value: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
  });

  it('accepts a cart ref id', () => {
    expect(parseCartLookupId('car2026123456')).toEqual({
      kind: 'refId',
      value: 'CAR2026123456',
    });
  });

  it('rejects GoKwik/Mongo-style 24-char ids so Postgres is not queried', () => {
    expect(parseCartLookupId('6aeac09aabb7d49828e240ed')).toBeNull();
  });
});
