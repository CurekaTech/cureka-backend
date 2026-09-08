import { BadRequestException } from '@nestjs/common';
import { CodBlockReasonCode } from '@modules/cod-blocklist/enums/cod-block-reason-code.enum';
import {
  CartCheckoutAdminSettingsService,
  COD_MINIMUM_ORDER_NOT_MET,
} from './cart-checkout-admin-settings.service';
import { CheckoutService } from './checkout.service';

describe('CheckoutService native COD blocklist enforcement', () => {
  const cartCheckoutAdminSettingsService = {
    resolveAmounts: jest.fn(),
    assertCodOrderEligible: jest.fn(),
  };
  const codBlocklistService = {
    assertNativeCodAllowed: jest.fn(),
  };

  const service = new CheckoutService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    cartCheckoutAdminSettingsService as unknown as CartCheckoutAdminSettingsService,
    {} as never,
    {} as never,
    {} as never,
    codBlocklistService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    cartCheckoutAdminSettingsService.resolveAmounts.mockResolvedValue({});
  });

  it('keeps existing COD minimum-order validation before the blocklist', async () => {
    cartCheckoutAdminSettingsService.assertCodOrderEligible.mockImplementation(() => {
      throw new BadRequestException({
        code: COD_MINIMUM_ORDER_NOT_MET,
        message: 'Cash on Delivery is available for orders of ₹599 or more.',
      });
    });

    await expect(
      service.assertCodPaymentEligible(100, { customerId: 'user-1', pincode: '380015' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: COD_MINIMUM_ORDER_NOT_MET }),
    });
    expect(codBlocklistService.assertNativeCodAllowed).not.toHaveBeenCalled();
  });

  it('rejects a blocked customer after min/max eligibility passes', async () => {
    cartCheckoutAdminSettingsService.assertCodOrderEligible.mockReturnValue(undefined);
    codBlocklistService.assertNativeCodAllowed.mockRejectedValue(
      new BadRequestException({
        code: CodBlockReasonCode.COD_BLOCKED_FOR_CUSTOMER,
        message: 'Cash on Delivery is not available for this account. Please use an online payment method.',
      }),
    );

    await expect(
      service.assertCodPaymentEligible(799, { customerId: 'user-1', pincode: '560001' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: CodBlockReasonCode.COD_BLOCKED_FOR_CUSTOMER }),
    });
  });

  it('rejects a blocked pincode after min/max eligibility passes', async () => {
    cartCheckoutAdminSettingsService.assertCodOrderEligible.mockReturnValue(undefined);
    codBlocklistService.assertNativeCodAllowed.mockRejectedValue(
      new BadRequestException({
        code: CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE,
        message: 'Cash on Delivery is not available for this delivery location.',
      }),
    );

    await expect(
      service.assertCodPaymentEligible(799, { customerId: 'user-1', pincode: '380015' }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: CodBlockReasonCode.COD_BLOCKED_FOR_PINCODE }),
    });
  });

  it('allows COD when min/max and the blocklist both pass', async () => {
    cartCheckoutAdminSettingsService.assertCodOrderEligible.mockReturnValue(undefined);
    codBlocklistService.assertNativeCodAllowed.mockResolvedValue(undefined);

    await expect(
      service.assertCodPaymentEligible(799, { customerId: 'user-1', pincode: '560001' }),
    ).resolves.toBeUndefined();
    expect(codBlocklistService.assertNativeCodAllowed).toHaveBeenCalledWith({
      customerId: 'user-1',
      mobileNumber: undefined,
      pincode: '560001',
    });
  });
});
