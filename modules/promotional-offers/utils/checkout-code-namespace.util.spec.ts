import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { assertCheckoutCodeAvailable, normalizeCheckoutCode } from './checkout-code-namespace.util';

describe('checkout code namespace', () => {
  it('normalizes codes the same way coupons do', () => {
    expect(normalizeCheckoutCode('  save10 ')).toBe('SAVE10');
  });

  it('locks and rejects when either table already has the code', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'offer-1' }]);
    const manager = { query } as unknown as EntityManager;

    await expect(assertCheckoutCodeAvailable(manager, 'save10')).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('pg_advisory_xact_lock'), ['checkout-code:SAVE10']);
    expect(query.mock.calls[1][0]).toContain('FROM coupons');
    expect(query.mock.calls[2][0]).toContain('FROM promotional_offers');
  });
});
