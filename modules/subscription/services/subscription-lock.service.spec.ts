import { SubscriptionLockService } from './subscription-lock.service';

describe('SubscriptionLockService', () => {
  const redis = {
    getConnectedClient: jest.fn(),
  };

  it('prevents two workers from holding the same in-process lock', async () => {
    redis.getConnectedClient.mockResolvedValue(null);
    const locks = new SubscriptionLockService(redis as never);
    const first = await locks.acquire('cycle-1', 5_000);
    const second = await locks.acquire('cycle-1', 5_000);
    expect(first).toBe(true);
    expect(second).toBe(false);
    await locks.release('cycle-1');
    const third = await locks.acquire('cycle-1', 5_000);
    expect(third).toBe(true);
  });

  it('uses Redis SET NX when Redis is available', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    redis.getConnectedClient.mockResolvedValue({ set, del: jest.fn() });
    const locks = new SubscriptionLockService(redis as never);
    await expect(locks.acquire('cycle-2')).resolves.toBe(true);
    expect(set).toHaveBeenCalledWith('subscription:lock:cycle-2', '1', 'PX', 60_000, 'NX');
  });
});
