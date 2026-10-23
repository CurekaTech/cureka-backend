import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CartService } from '@modules/orders/services/cart.service';
import { RefundWalletService } from '@modules/refund-requests/services/refund-wallet.service';
import { rupeesToPaise } from '@modules/refund-requests/utils/wallet-money.util';
import { gokwikWalletApplyIdempotencyKey, isGokwikWalletUnsupportedPaymentMethod } from '../constants/gokwik-wallet.constants';
import { GokwikGetCartSuccessResponse } from '../interfaces/gokwik-cart.interface';
import { mapCartToGokwikCart } from '../mappers/gokwik-cart.mapper';
import { GokwikCartService } from './gokwik-cart.service';
import {
  GOKWIK_WALLET_CONTRACT_REGISTER,
  GOKWIK_WALLET_LIVE_BLOCKERS,
  GOKWIK_WALLET_SETTLEMENT_BLOCKERS,
  GokwikWalletApplyRequest,
  GokwikWalletContractQuestionId,
  GokwikWalletContractQuestionRecord,
  GokwikWalletRemoveRequest,
} from '../interfaces/gokwik-wallet-contract.interface';
import {
  computeEligibleWalletCreditPaise,
  floorWalletCreditToWholeRupeePaise,
  gokwikWalletAllocationFingerprint,
  gokwikWalletApplyIdempotencyKeyWithFingerprint,
  gokwikWalletRemoveIdempotencyKey,
  isMaterialGokwikWalletCartChange,
} from '../utils/gokwik-wallet-allocation.util';
import {
  paiseToGokwikWalletRupees,
  remainingPayableRupeesForGokwik,
} from '../utils/gokwik-wallet-money.util';

/**
 * Provisional apply plan. Does not mutate the ledger.
 * Live reserve/consume remains blocked while contract blockers are open.
 */
export type GokwikWalletApplyPlan = {
  cartId: string;
  customerId: string;
  paymentMethod: string | null;
  availableBalancePaise: number;
  reservedBalancePaise: number;
  eligibleCartTotalPaise: number;
  exactWalletCreditPaise: number;
  /** Whole-rupee floored credit for provisional GoKwik wire. */
  wireWalletCreditPaise: number;
  remainingPayablePaise: number;
  fingerprint: string;
  applyIdempotencyKey: string;
  removeIdempotencyKey: string;
  wire: {
    walletCreditUsed: number;
    total: number;
  };
  requiresReleaseReplace: boolean;
};

/**
 * Isolated GoKwik wallet adapter boundary.
 *
 * Native Razorpay/Cashfree wallet checkout must not be reused here.
 * Apply and remove run only when `GOKWIK_WALLET_REDEMPTION_ENABLED` is true.
 * Apply places a reservation. It does not debit. Final consume stays blocked.
 *
 * Intended lifecycle (Cureka policy — final debit event still vendor-gated):
 *
 *   get-user (balance display)
 *     → apply-wallet-credit → RESERVE (not debit)
 *     → cart edits → remove and/or re-apply (sequence TBD with GoKwik)
 *     → create/place-order (prepaid only; reject COD/pp-cod)
 *     → verified transaction webhook success/paid → CONSUME reservation (final debit)
 *     → definitive fail/cancel/remove → RELEASE reservation
 *     → uncertain timeout → reconcile; do not speculative release/debit
 */
@Injectable()
export class GokwikWalletRedemptionService {
  private readonly logger = new Logger(GokwikWalletRedemptionService.name);

  /**
   * Open / blocking question IDs (compat with prior OPEN_QUESTIONS usage).
   * Prefer `getContractRegister()` for full status records.
   */
  static readonly OPEN_QUESTIONS: GokwikWalletContractQuestionId[] = [
    ...GOKWIK_WALLET_LIVE_BLOCKERS,
  ];

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(forwardRef(() => RefundWalletService))
    private readonly walletService?: RefundWalletService,
    @Optional()
    @Inject(forwardRef(() => GokwikCartService))
    private readonly gokwikCartService?: GokwikCartService,
    @Optional()
    private readonly dataSource?: DataSource,
    @Optional()
    private readonly ordersCartService?: CartService,
  ) {}

  /**
   * Display-only balance for GoKwik get-user.
   * Returns null when GOKWIK_WALLET_REDEMPTION_ENABLED is not true, so the
   * response omits wallet fields. Amounts are whole rupees. No funds move.
   */
  async readWalletBalancesForGetUser(customerId: string): Promise<{
    wallet_balance: number;
    usable_wallet_balance: number;
  } | null> {
    if (!this.isEnabled()) return null;
    if (!this.walletService) {
      return { wallet_balance: 0, usable_wallet_balance: 0 };
    }

    const overview = await this.walletService.getOverview(customerId);
    if (overview.status !== 'ACTIVE') {
      return { wallet_balance: 0, usable_wallet_balance: 0 };
    }

    const balancePaise = rupeesToPaise(overview.balance);
    const usablePaise = Math.max(0, rupeesToPaise(overview.available));
    return {
      wallet_balance: this.formatUsableBalanceForWire(balancePaise, 0),
      usable_wallet_balance: this.formatUsableBalanceForWire(usablePaise, 0),
    };
  }

  isEnabled(): boolean {
    return this.configService.get<boolean>('wallet.gokwikRedemptionEnabled') === true;
  }

  getContractRegister(): GokwikWalletContractQuestionRecord[] {
    return GOKWIK_WALLET_CONTRACT_REGISTER;
  }

  getLiveBlockers(): GokwikWalletContractQuestionId[] {
    return [...GOKWIK_WALLET_LIVE_BLOCKERS];
  }

  getSettlementBlockers(): GokwikWalletContractQuestionId[] {
    return GOKWIK_WALLET_SETTLEMENT_BLOCKERS.filter((id) =>
      this.getLiveBlockers().includes(id),
    );
  }

  /**
   * Live redemption requires the env flag AND zero critical contract blockers.
   * Compiling code or enabling the flag alone is not sufficient.
   */
  canEnableLiveRedemption(): boolean {
    return this.isEnabled() && this.getLiveBlockers().length === 0;
  }

  /**
   * Final CHECKOUT_DEBIT / consume is separately gated on settlement blockers.
   * Never trust browser redirects.
   */
  canEnableLiveSettlement(): boolean {
    return this.canEnableLiveRedemption() && this.getSettlementBlockers().length === 0;
  }

  assertPaymentMethodAllowsWallet(paymentMethod: string | null | undefined): void {
    if (isGokwikWalletUnsupportedPaymentMethod(paymentMethod)) {
      throw new BadRequestException({
        code: 'GOKWIK_WALLET_COD_EXCLUDED',
        error: 'Cureka Wallet cannot be combined with COD or partial COD on GoKwik checkout',
        paymentMethod,
      });
    }
  }

  /**
   * Builds a provisional apply plan from Cureka-authoritative balances.
   * Does not reserve or debit. Safe to call in tests / dry-run.
   */
  planApply(input: {
    cartId: string;
    customerId: string;
    paymentMethod?: string | null;
    availableBalancePaise: number;
    reservedBalancePaise: number;
    eligibleCartTotalPaise: number;
    previousEligibleCartTotalPaise?: number;
    previousWalletCreditPaise?: number;
  }): GokwikWalletApplyPlan {
    this.assertCartId(input.cartId);
    if (!input.customerId?.trim()) {
      throw new BadRequestException({ error: 'customerId is required' });
    }
    this.assertPaymentMethodAllowsWallet(input.paymentMethod);

    const eligibility = computeEligibleWalletCreditPaise({
      availableBalancePaise: input.availableBalancePaise,
      reservedBalancePaise: input.reservedBalancePaise,
      eligibleCartTotalPaise: input.eligibleCartTotalPaise,
    });

    // Provisional wire: whole rupees only. Floor — never round up credit or cart total.
    const wireEligiblePaise = floorWalletCreditToWholeRupeePaise(
      input.eligibleCartTotalPaise,
    );
    const wireWalletCreditPaise = floorWalletCreditToWholeRupeePaise(
      Math.min(eligibility.walletCreditPaise, wireEligiblePaise),
    );
    if (wireWalletCreditPaise <= 0) {
      throw new BadRequestException({
        code: 'GOKWIK_WALLET_NO_ELIGIBLE_CREDIT',
        error: 'No whole-rupee wallet credit is available for this cart',
        exactWalletCreditPaise: eligibility.walletCreditPaise,
      });
    }

    const remainingPayablePaise = wireEligiblePaise - wireWalletCreditPaise;
    const fingerprint = gokwikWalletAllocationFingerprint({
      cartId: input.cartId,
      eligibleCartTotalPaise: wireEligiblePaise,
      walletCreditPaise: wireWalletCreditPaise,
    });
    const wire = remainingPayableRupeesForGokwik({
      eligibleTotalPaise: wireEligiblePaise,
      walletCreditPaise: wireWalletCreditPaise,
    });

    const requiresReleaseReplace =
      input.previousEligibleCartTotalPaise !== undefined &&
      input.previousWalletCreditPaise !== undefined &&
      isMaterialGokwikWalletCartChange({
        previousEligibleCartTotalPaise: input.previousEligibleCartTotalPaise,
        nextEligibleCartTotalPaise: wireEligiblePaise,
        previousWalletCreditPaise: input.previousWalletCreditPaise,
        nextWalletCreditPaise: wireWalletCreditPaise,
      });

    return {
      cartId: input.cartId.trim(),
      customerId: input.customerId.trim(),
      paymentMethod: input.paymentMethod ?? null,
      availableBalancePaise: input.availableBalancePaise,
      reservedBalancePaise: input.reservedBalancePaise,
      eligibleCartTotalPaise: input.eligibleCartTotalPaise,
      exactWalletCreditPaise: eligibility.walletCreditPaise,
      wireWalletCreditPaise,
      remainingPayablePaise,
      fingerprint,
      applyIdempotencyKey: gokwikWalletApplyIdempotencyKeyWithFingerprint(
        input.cartId,
        fingerprint,
      ),
      removeIdempotencyKey: gokwikWalletRemoveIdempotencyKey(input.cartId),
      wire,
      requiresReleaseReplace,
    };
  }

  /**
   * Explicit settlement gate. Speculative consume/debit must call this first.
   */
  assertLiveSettlementAllowed(context: {
    operation: 'consume' | 'release-uncertain';
    cartId?: string;
  }): never {
    const blockers = this.getSettlementBlockers();
    this.logger.warn(
      {
        operation: context.operation,
        cartId: context.cartId ?? null,
        blockers,
        flagEnabled: this.isEnabled(),
      },
      'GoKwik wallet settlement refused — settlement contract incomplete',
    );
    throw new ServiceUnavailableException({
      error: 'GoKwik wallet settlement is not production-ready',
      code: 'GOKWIK_WALLET_SETTLEMENT_BLOCKED',
      openQuestions: blockers.length > 0 ? blockers : this.getLiveBlockers(),
      note: 'Browser redirects are never proof of payment success',
    });
  }

  /**
   * Whole rupees currently held for this GoKwik cart.
   * Flag off, or no pending hold, returns 0 and does not touch the ledger.
   */
  async readAppliedWalletCreditRupees(cartId: string): Promise<number> {
    if (!this.isEnabled() || !this.walletService || !cartId.trim()) return 0;
    const pending = await this.walletService.listPendingByIdempotencyPrefix(
      gokwikWalletApplyIdempotencyKey(cartId),
    );
    const paise = pending.reduce((sum, row) => sum + Number(row.amountPaise), 0);
    if (paise <= 0) return 0;
    return this.formatUsableBalanceForWire(paise, 0);
  }

  /**
   * Merchant-hosted apply-wallet-credit (GoKwik → Cureka).
   * Flag off: refuse, no hold. Flag on: reserve the usable whole-rupee amount
   * and return the cart with wallet_credit_used. Does not debit.
   */
  async applyWalletCredit(input: GokwikWalletApplyRequest): Promise<GokwikGetCartSuccessResponse> {
    this.assertCartId(input.cart_id);
    if (!this.isEnabled()) {
      this.assertDisabled();
    }
    this.assertStagingReady();

    const cartId = input.cart_id.trim();
    const cartEntity = await this.ordersCartService!.findActiveCartById(cartId);
    if (!cartEntity) throw new BadRequestException('Invalid cart id');
    const priced = await this.ordersCartService!.getCartById(cartEntity.id);
    if (!priced.items.length) throw new BadRequestException('Cart is empty');

    const overview = await this.walletService!.getOverview(cartEntity.userId);
    if (overview.status !== 'ACTIVE') {
      throw new ConflictException('Wallet is not available for spending');
    }

    const prefix = gokwikWalletApplyIdempotencyKey(cartId);
    const eligibleCartTotalPaise = mapCartToGokwikCart(priced).total * 100;
    await this.dataSource!.transaction(async (manager) => {
      const pending = await this.walletService!.listPendingByIdempotencyPrefix(prefix, manager);
      const ownHoldPaise = pending.reduce((sum, row) => sum + Number(row.amountPaise), 0);
      const plan = this.planApply({
        cartId,
        customerId: cartEntity.userId,
        availableBalancePaise: rupeesToPaise(overview.available) + ownHoldPaise,
        reservedBalancePaise: 0,
        eligibleCartTotalPaise,
      });
      const alreadyHeld =
        pending.length === 1 && Number(pending[0]?.amountPaise) === plan.wireWalletCreditPaise;
      if (alreadyHeld) return;

      for (const row of pending) {
        await this.walletService!.releaseReservation(row.id, cartEntity.userId, manager);
      }
      const ttlMinutes = this.configService.get<number>('wallet.reservationTtlMinutes') ?? 60;
      await this.walletService!.reserve(
        {
          customerId: cartEntity.userId,
          amountPaise: plan.wireWalletCreditPaise,
          paymentRequestId: null,
          idempotencyKey: plan.applyIdempotencyKey,
          expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
          actorId: cartEntity.userId,
        },
        manager,
      );
    });

    return this.gokwikCartService!.getCart(cartId);
  }

  /**
   * Releases the GoKwik cart hold and returns the cart with wallet_credit_used 0.
   * Flag off refuses. A cart with no hold still returns the current cart.
   */
  async removeWalletCredit(input: GokwikWalletRemoveRequest): Promise<GokwikGetCartSuccessResponse> {
    this.assertCartId(input.cart_id);
    if (!this.isEnabled()) {
      this.assertDisabled();
    }
    this.assertStagingReady();

    const cartId = input.cart_id.trim();
    const prefix = gokwikWalletApplyIdempotencyKey(cartId);
    await this.dataSource!.transaction(async (manager) => {
      const pending = await this.walletService!.listPendingByIdempotencyPrefix(prefix, manager);
      for (const row of pending) {
        await this.walletService!.releaseReservation(row.id, row.customerId, manager);
      }
    });

    return this.gokwikCartService!.getCart(cartId);
  }

  /** Wire helper for get-user style balance display (whole rupees provisional). */
  formatUsableBalanceForWire(availableBalancePaise: number, reservedBalancePaise: number): number {
    const usable = Math.max(0, availableBalancePaise - reservedBalancePaise);
    const whole = floorWalletCreditToWholeRupeePaise(usable);
    return paiseToGokwikWalletRupees(whole);
  }

  private assertDisabled(): never {
    throw new BadRequestException({
      error: 'GoKwik wallet redemption is disabled',
      code: 'GOKWIK_WALLET_DISABLED',
    });
  }

  private assertStagingReady(): void {
    if (!this.walletService || !this.gokwikCartService || !this.dataSource || !this.ordersCartService) {
      throw new ServiceUnavailableException({
        error: 'GoKwik wallet redemption is not available',
        code: 'GOKWIK_WALLET_UNAVAILABLE',
      });
    }
  }

  private assertCartId(cartId: string | undefined): asserts cartId is string {
    if (!cartId?.trim()) {
      throw new BadRequestException({ error: 'cart_id is required' });
    }
  }
}
