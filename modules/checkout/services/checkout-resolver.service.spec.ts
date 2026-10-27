import { AdminSettingStatus } from '@modules/admin-settings/enums/admin-setting-status.enum';
import { CheckoutResolverService } from './checkout-resolver.service';

describe('CheckoutResolverService', () => {
  function createService(rows: Record<string, { status: string; value: string }>) {
    const repository = {
      findByKey: jest.fn(async (key: string) => rows[key] ?? null),
    };
    return new CheckoutResolverService(repository as never);
  }

  it('prefers GoKwik for cart when only its status is active', async () => {
    const service = createService({
      gokwikCheckoutEnabled: { status: AdminSettingStatus.ACTIVE, value: 'false' },
      cash_free: { status: AdminSettingStatus.ACTIVE, value: '1' },
    });

    await expect(service.resolveProvider()).resolves.toBe('gokwik');
  });

  it('falls back to legacy and reports Cashfree when Razorpay is off', async () => {
    const service = createService({
      gokwikCheckoutEnabled: { status: AdminSettingStatus.INACTIVE, value: 'false' },
      cash_free: { status: AdminSettingStatus.ACTIVE, value: '1' },
      razor_pay: { status: AdminSettingStatus.INACTIVE, value: '0' },
    });

    await expect(service.resolveProvider()).resolves.toBe('legacy');
    await expect(service.resolveNativeGateway()).resolves.toBe('cashfree');
  });
});
