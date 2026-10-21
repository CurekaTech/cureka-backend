import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import {
  GOKWIK_WALLET_LIVE_BLOCKERS,
  GOKWIK_WALLET_SETTLEMENT_BLOCKERS,
} from '../interfaces/gokwik-wallet-contract.interface';
import { GokwikWalletRedemptionService } from './gokwik-wallet-redemption.service';

describe('GokwikWalletRedemptionService', () => {
  const configService = { get: jest.fn() };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('omits the wallet balance when GOKWIK_WALLET_REDEMPTION_ENABLED is false', async () => {
    configService.get.mockReturnValue(false);
    const walletService = { getOverview: jest.fn() };
    const service = new GokwikWalletRedemptionService(configService as never, walletService as never);

    await expect(service.readWalletBalancesForGetUser('user-1')).resolves.toBeNull();
    expect(walletService.getOverview).not.toHaveBeenCalled();
  });

  it('returns whole-rupee balances when the GoKwik wallet flag is true', async () => {
    configService.get.mockImplementation((key: string) => key === 'wallet.gokwikRedemptionEnabled');
    const walletService = {
      getOverview: jest.fn(async () => ({
        balance: '125.50',
        reserved: '0.00',
        available: '100.40',
        currency: 'INR',
        status: 'ACTIVE',
      })),
    };
    const service = new GokwikWalletRedemptionService(configService as never, walletService as never);

    await expect(service.readWalletBalancesForGetUser('user-1')).resolves.toEqual({
      wallet_balance: 125,
      usable_wallet_balance: 100,
    });
  });

  it('rejects apply when GOKWIK_WALLET_REDEMPTION_ENABLED is false', async () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    await expect(service.applyWalletCredit({ cart_id: 'cart-1' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GOKWIK_WALLET_DISABLED' }),
    });
  });

  it('rejects remove when the feature flag is false', async () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    await expect(service.removeWalletCredit({ cart_id: 'cart-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires cart_id', async () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    await expect(service.applyWalletCredit({ cart_id: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses live mutation when the flag is true but contract blockers remain', async () => {
    configService.get.mockReturnValue(true);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(service.canEnableLiveRedemption()).toBe(false);
    expect(service.canEnableLiveSettlement()).toBe(false);
    await expect(service.applyWalletCredit({ cart_id: 'cart-1', user_id: 'u1' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'GOKWIK_WALLET_CONTRACT_INCOMPLETE' }),
    });
    await expect(service.removeWalletCredit({ cart_id: 'cart-1' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('exposes the eight-question contract register with provisional assumptions', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    const register = service.getContractRegister();
    expect(register).toHaveLength(8);
    expect(service.getLiveBlockers()).toEqual([...GOKWIK_WALLET_LIVE_BLOCKERS]);
    expect(GokwikWalletRedemptionService.OPEN_QUESTIONS).toContain('FINAL_DEBIT_TRIGGER_EVENT');
    expect(GokwikWalletRedemptionService.OPEN_QUESTIONS).toContain('COD_AND_PARTIAL_COD_EXCLUSION');
    for (const q of register) {
      expect(q.provisionalAssumption.length).toBeGreaterThan(0);
      expect(q.status).not.toBe('CONFIRMED_BY_GOKWIK');
      expect(q.status).not.toBe('CONFIRMED_BY_OFFICIAL_DOCS');
    }
  });

  it('enforces Cureka COD/pp-cod exclusion policy', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(() => service.assertPaymentMethodAllowsWallet('cod')).toThrow(BadRequestException);
    expect(() => service.assertPaymentMethodAllowsWallet('pp-cod')).toThrow(BadRequestException);
    expect(() => service.assertPaymentMethodAllowsWallet('prepaid')).not.toThrow();
  });

  it('plans apply without mutating funds and floors fractional rupees', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    const plan = service.planApply({
      cartId: 'cart-1',
      customerId: 'user-1',
      paymentMethod: 'prepaid',
      availableBalancePaise: 12550, // ₹125.50 — exact ledger
      reservedBalancePaise: 0,
      eligibleCartTotalPaise: 20000, // ₹200.00 cart (mapper whole rupees)
    });
    expect(plan.exactWalletCreditPaise).toBe(12550);
    expect(plan.wireWalletCreditPaise).toBe(12500); // floored, never round up
    expect(plan.wire).toEqual({ walletCreditUsed: 125, total: 75 });
    expect(plan.applyIdempotencyKey).toContain('wallet-gokwik-apply:cart-1');
    expect(plan.requiresReleaseReplace).toBe(false);
  });

  it('marks material cart changes as release/replace', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    const plan = service.planApply({
      cartId: 'cart-1',
      customerId: 'user-1',
      paymentMethod: 'prepaid',
      availableBalancePaise: 50000,
      reservedBalancePaise: 0,
      eligibleCartTotalPaise: 9000,
      previousEligibleCartTotalPaise: 10000,
      previousWalletCreditPaise: 10000,
    });
    expect(plan.requiresReleaseReplace).toBe(true);
  });

  it('rejects COD during planApply', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(() =>
      service.planApply({
        cartId: 'cart-1',
        customerId: 'user-1',
        paymentMethod: 'cod',
        availableBalancePaise: 10000,
        reservedBalancePaise: 0,
        eligibleCartTotalPaise: 5000,
      }),
    ).toThrow(BadRequestException);
  });

  it('blocks speculative settlement consume while settlement blockers remain', () => {
    configService.get.mockReturnValue(true);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(service.getSettlementBlockers()).toEqual(
      expect.arrayContaining([...GOKWIK_WALLET_SETTLEMENT_BLOCKERS]),
    );
    expect(() =>
      service.assertLiveSettlementAllowed({ operation: 'consume', cartId: 'cart-1' }),
    ).toThrow(ServiceUnavailableException);
  });

  it('formats usable balance for wire as whole rupees', () => {
    configService.get.mockReturnValue(false);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(service.formatUsableBalanceForWire(10001, 0)).toBe(100); // floors ₹100.01
    expect(service.formatUsableBalanceForWire(10000, 0)).toBe(100);
  });
});
