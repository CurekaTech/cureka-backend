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

  it('reserves wallet credit and returns the cart when the flag is true', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'wallet.gokwikRedemptionEnabled') return true;
      if (key === 'wallet.reservationTtlMinutes') return 60;
      return undefined;
    });
    const walletService = {
      getOverview: jest.fn(async () => ({
        balance: '125.50',
        reserved: '0.00',
        available: '125.50',
        currency: 'INR',
        status: 'ACTIVE',
      })),
      listPendingByIdempotencyPrefix: jest.fn(async () => []),
      releaseReservation: jest.fn(),
      reserve: jest.fn(async () => ({ id: 'res-1' })),
    };
    const ordersCartService = {
      findActiveCartById: jest.fn(async () => ({ id: 'cart-1', userId: 'user-1' })),
      getCartById: jest.fn(async () => ({
        cartId: 'cart-1',
        totalItems: 1,
        subtotal: 200,
        discountAmount: 0,
        shippingAmount: 0,
        handlingAmount: 0,
        platformFee: 0,
        codCharge: 0,
        prepaidDiscount: 0,
        grandTotal: 200,
        coupon: null,
        items: [
          {
            id: 'line-1',
            productId: 'product-1',
            variantId: 'variant-1',
            productName: 'Serum',
            sku: 'SKU-1',
            quantity: 1,
            unitPrice: 200,
            totalPrice: 200,
            stock: 2,
            isAvailable: true,
            categoryId: 'category-1',
          },
        ],
        checkoutRules: {},
        cod: { available: false },
      })),
    };
    const gokwikCartService = {
      getCart: jest.fn(async () => ({
        data: { cart: { total: 75, wallet_credit_used: 125 } },
      })),
    };
    const dataSource = { transaction: jest.fn(async (work: (manager: object) => Promise<void>) => work({})) };
    const service = new GokwikWalletRedemptionService(
      configService as never,
      walletService as never,
      gokwikCartService as never,
      dataSource as never,
      ordersCartService as never,
    );

    await expect(service.applyWalletCredit({ cart_id: 'cart-1' })).resolves.toEqual({
      data: { cart: { total: 75, wallet_credit_used: 125 } },
    });
    expect(walletService.releaseReservation).not.toHaveBeenCalled();
    expect(walletService.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'user-1',
        amountPaise: 12500,
        paymentRequestId: null,
      }),
      expect.anything(),
    );
    expect(service.canEnableLiveSettlement()).toBe(false);
  });

  it('releases the cart hold when remove runs with the flag true', async () => {
    configService.get.mockImplementation((key: string) => key === 'wallet.gokwikRedemptionEnabled');
    const walletService = {
      listPendingByIdempotencyPrefix: jest.fn(async () => [
        { id: 'res-1', customerId: 'user-1', amountPaise: '12500' },
      ]),
      releaseReservation: jest.fn(async () => ({ id: 'res-1' })),
    };
    const gokwikCartService = {
      getCart: jest.fn(async () => ({
        data: { cart: { total: 200, wallet_credit_used: 0 } },
      })),
    };
    const dataSource = { transaction: jest.fn(async (work: (manager: object) => Promise<void>) => work({})) };
    const ordersCartService = { findActiveCartById: jest.fn(), getCartById: jest.fn() };
    const service = new GokwikWalletRedemptionService(
      configService as never,
      walletService as never,
      gokwikCartService as never,
      dataSource as never,
      ordersCartService as never,
    );

    await expect(service.removeWalletCredit({ cart_id: 'cart-1' })).resolves.toEqual({
      data: { cart: { total: 200, wallet_credit_used: 0 } },
    });
    expect(walletService.releaseReservation).toHaveBeenCalledWith('res-1', 'user-1', expect.anything());
  });

  it('does not debit while settlement blockers remain', () => {
    configService.get.mockReturnValue(true);
    const service = new GokwikWalletRedemptionService(configService as never);
    expect(service.canEnableLiveRedemption()).toBe(false);
    expect(service.canEnableLiveSettlement()).toBe(false);
    expect(() =>
      service.assertLiveSettlementAllowed({ operation: 'consume', cartId: 'cart-1' }),
    ).toThrow(ServiceUnavailableException);
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
