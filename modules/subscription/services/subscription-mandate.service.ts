import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateUniqueRefId } from '@packages/common';
import { SUBSCRIPTION_ERROR } from '../constants/subscription.constants';
import { SubscriptionMandateEntity } from '../entities/subscription-mandate.entity';
import { UserProductSubscriptionEntity } from '../entities/user-product-subscription.entity';
import { SubscriptionHistoryAction } from '../enums/subscription-history-action.enum';
import { SubscriptionMandateProvider } from '../enums/subscription-mandate-provider.enum';
import { SubscriptionMandateStatus } from '../enums/subscription-mandate-status.enum';
import { SubscriptionRenewalMethod } from '../enums/subscription-renewal-method.enum';
import { MandateAuthSession, AutopayChargeResult } from '../interfaces/subscription-mandate-provider.interface';
import { SubscriptionMandatesRepository } from '../repositories/subscription-mandates.repository';
import { UserProductSubscriptionsRepository } from '../repositories/user-product-subscriptions.repository';
import { resolveMandateMaxAmount } from '../utils/mandate-amount.util';
import {
  isMandateAutopayReady,
  isMandateTerminal,
} from '../utils/subscription-mandate-status.util';
import { CashfreeSubscriptionProvider } from './providers/cashfree-subscription.provider';
import { RazorpayRecurringProvider } from './providers/razorpay-recurring.provider';
import { SubscriptionStatusHistoryRepository } from '../repositories/subscription-status-history.repository';

@Injectable()
export class SubscriptionMandateService {
  private readonly logger = new Logger(SubscriptionMandateService.name);

  constructor(
    private readonly mandatesRepository: SubscriptionMandatesRepository,
    private readonly subscriptionsRepository: UserProductSubscriptionsRepository,
    private readonly historyRepository: SubscriptionStatusHistoryRepository,
    private readonly razorpay: RazorpayRecurringProvider,
    private readonly cashfree: CashfreeSubscriptionProvider,
    private readonly configService: ConfigService,
  ) {}

  isAutopayFeatureEnabled(): boolean {
    return this.configService.get<boolean>('subscriptions.autopayEnabled') === true;
  }

  async getForSubscription(subscriptionId: string): Promise<SubscriptionMandateEntity | null> {
    return this.mandatesRepository.findLatestBySubscriptionId(subscriptionId);
  }

  canPresentAsAutopay(sub: UserProductSubscriptionEntity, mandate?: SubscriptionMandateEntity | null): boolean {
    if (!this.isAutopayFeatureEnabled()) return false;
    if (!sub.autopayReady) return false;
    if (!mandate) return false;
    return isMandateAutopayReady(mandate.status);
  }

  async startAuthorization(params: {
    subscription: UserProductSubscriptionEntity;
    customer: { name?: string; email?: string | null; phone: string };
    actor: string;
    returnUrl?: string;
    /** When set, this checkout charges that amount and registers the mandate together. */
    authorizationAmount?: string;
    notes?: Record<string, string>;
    method?: 'upi' | 'card';
  }): Promise<{ mandate: SubscriptionMandateEntity; session: MandateAuthSession }> {
    if (!this.isAutopayFeatureEnabled()) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
        message: 'AutoPay is not enabled for this merchant. Recurring cycles use a manual payment link.',
      });
    }

    const maxAmount = resolveMandateMaxAmount({
      productMandateMaxAmount: params.subscription.mandateMaxAmount ?? params.subscription.config?.mandateMaxAmount,
      globalMandateMaxAmount: this.configService.get<string>('subscriptions.mandateMaxAmount'),
    });
    if (!maxAmount) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
        message: 'Mandate maximum amount is not configured. Set it on the product or SUBSCRIPTION_MANDATE_MAX_AMOUNT.',
      });
    }

    const provider = this.resolveNewMandateProvider();
    const adapter = this.adapter(provider);
    if (!adapter.isConfigured()) {
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
        message: `${provider} Recurring/Subscriptions credentials are missing`,
      });
    }

    const session = await adapter.createAuthorizationSession({
      subscriptionId: params.subscription.id,
      userId: params.subscription.userId,
      customer: params.customer,
      maxAmount,
      authorizationAmount: params.authorizationAmount,
      method: params.method,
      notes: params.notes ?? {
        paymentPurpose: 'PRODUCT_SUBSCRIPTION_MANDATE',
        subscriptionId: params.subscription.id,
        userId: params.subscription.userId,
      },
      returnUrl: params.returnUrl,
    });

    const refId = await generateUniqueRefId('man', (c) => this.mandatesRepository.existsByRefId(c));
    const mandate = await this.mandatesRepository.create({
      refId,
      subscriptionId: params.subscription.id,
      userId: params.subscription.userId,
      provider,
      status: SubscriptionMandateStatus.PENDING,
      maxAmount,
      currency: 'INR',
      gatewayCustomerId: session.gatewayCustomerId ?? null,
      gatewaySubscriptionId: session.gatewaySubscriptionId ?? null,
      authorizationOrderId: session.authorizationOrderId,
      consentEvidence: {
        startedAt: new Date().toISOString(),
        actor: params.actor,
        firstCharge: Boolean(params.authorizationAmount),
        subscriptionPaymentId: params.notes?.subscriptionPaymentId ?? null,
        method: params.method === 'card' ? 'card' : 'upi',
        cardAuthOnly: false,
      },
      createdBy: params.actor,
      updatedBy: params.actor,
    });

    await this.subscriptionsRepository.updateById(params.subscription.id, {
      mandateId: mandate.id,
      mandateMaxAmount: maxAmount,
      paymentGateway: provider,
      gatewayCustomerId: session.gatewayCustomerId ?? params.subscription.gatewayCustomerId,
      gatewaySubscriptionId: session.gatewaySubscriptionId ?? params.subscription.gatewaySubscriptionId,
      autopayReady: false,
      updatedBy: params.actor,
    });
    await this.historyRepository.append({
      subscriptionId: params.subscription.id,
      action: SubscriptionHistoryAction.MANDATE_UPDATED,
      performedBy: params.actor,
      toStatus: SubscriptionMandateStatus.PENDING,
      details: { provider, mandateId: mandate.id },
    });

    return { mandate, session };
  }

  async applyStatusSnapshot(params: {
    mandateId: string;
    status: SubscriptionMandateStatus;
    gatewayMandateId?: string | null;
    gatewayPaymentId?: string | null;
    actor: string;
    raw?: Record<string, unknown>;
  }): Promise<SubscriptionMandateEntity | null> {
    const mandate = await this.mandatesRepository.findById(params.mandateId);
    if (!mandate) return null;

    await this.mandatesRepository.updateById(mandate.id, {
      status: params.status,
      gatewayMandateId: params.gatewayMandateId ?? mandate.gatewayMandateId,
      authorizationPaymentId: params.gatewayPaymentId ?? mandate.authorizationPaymentId,
      authorizedAt: isMandateAutopayReady(params.status) ? new Date() : mandate.authorizedAt,
      revokedAt: isMandateTerminal(params.status) ? new Date() : mandate.revokedAt,
      metadata: params.raw ?? mandate.metadata,
      updatedBy: params.actor,
    });

    const ready = isMandateAutopayReady(params.status);
    await this.subscriptionsRepository.updateById(mandate.subscriptionId, {
      autopayReady: ready,
      renewalMethod: ready ? SubscriptionRenewalMethod.AUTO_PAY : SubscriptionRenewalMethod.PAYMENT_LINK,
      gatewayMandateId: params.gatewayMandateId ?? mandate.gatewayMandateId,
      paymentGateway: mandate.provider,
      updatedBy: params.actor,
    });
    await this.historyRepository.append({
      subscriptionId: mandate.subscriptionId,
      action: ready ? SubscriptionHistoryAction.MANDATE_UPDATED : SubscriptionHistoryAction.AUTOPAY_DISABLED,
      performedBy: params.actor,
      fromStatus: mandate.status,
      toStatus: params.status,
    });
    return this.mandatesRepository.findById(mandate.id);
  }

  async handleProviderWebhook(params: {
    provider: SubscriptionMandateProvider;
    gatewayMandateId?: string | null;
    gatewaySubscriptionId?: string | null;
    authorizationOrderId?: string | null;
    gatewayPaymentId?: string | null;
    gatewayCustomerId?: string | null;
    status: SubscriptionMandateStatus;
    actor: string;
    raw?: Record<string, unknown>;
  }): Promise<boolean> {
    const mandate =
      (params.gatewayMandateId
        ? await this.mandatesRepository.findByGatewayMandateId(params.gatewayMandateId)
        : null) ??
      (params.gatewaySubscriptionId
        ? await this.mandatesRepository.findByGatewaySubscriptionId(params.gatewaySubscriptionId)
        : null) ??
      (params.authorizationOrderId
        ? await this.mandatesRepository.findByAuthorizationOrderId(params.authorizationOrderId)
        : null) ??
      (params.gatewayCustomerId
        ? await this.mandatesRepository.findLatestPendingByGatewayCustomerId(params.gatewayCustomerId)
        : null);
    if (!mandate) return false;
    if (mandate.provider !== params.provider) {
      this.logger.warn(
        { mandateId: mandate.id, stored: mandate.provider, incoming: params.provider },
        'Ignoring mandate webhook from a different provider',
      );
      return true;
    }
    await this.applyStatusSnapshot({
      mandateId: mandate.id,
      status: params.status,
      gatewayMandateId: params.gatewayMandateId,
      gatewayPaymentId: params.gatewayPaymentId,
      actor: params.actor,
      raw: params.raw,
    });
    return true;
  }

  resolveChargeProvider(sub: UserProductSubscriptionEntity): SubscriptionMandateProvider | null {
    const stored = (sub.paymentGateway ?? '').toUpperCase();
    if (stored === SubscriptionMandateProvider.RAZORPAY) return SubscriptionMandateProvider.RAZORPAY;
    if (stored === SubscriptionMandateProvider.CASHFREE) return SubscriptionMandateProvider.CASHFREE;
    return null;
  }

  adapter(provider: SubscriptionMandateProvider): RazorpayRecurringProvider | CashfreeSubscriptionProvider {
    return provider === SubscriptionMandateProvider.CASHFREE ? this.cashfree : this.razorpay;
  }

  willRegisterMandateOnFirstCharge(params: {
    amount: string | number;
    productMandateMaxAmount?: string | null;
  }): boolean {
    if (!this.isAutopayFeatureEnabled() || !this.configuredMandateProvider()) return false;
    const maxAmount = resolveMandateMaxAmount({
      productMandateMaxAmount: params.productMandateMaxAmount,
      globalMandateMaxAmount: this.configService.get<string>('subscriptions.mandateMaxAmount'),
    });
    const amount = Number(params.amount);
    return Boolean(maxAmount) && Number.isFinite(amount) && amount > 0 && amount <= Number(maxAmount);
  }

  /**
   * First Subscribe checkout charges the product and registers UPI AutoPay together.
   * Returns null when AutoPay cannot be registered, so the caller keeps the normal payment.
   */
  async tryStartFirstChargeAuthorization(params: {
    subscription: UserProductSubscriptionEntity;
    customer: { name?: string; email?: string | null; phone: string };
    actor: string;
    amount: string;
    productMandateMaxAmount?: string | null;
    notes: Record<string, string>;
    method?: 'upi' | 'card';
  }): Promise<{ mandate: SubscriptionMandateEntity; session: MandateAuthSession } | null> {
    if (
      !params.customer.phone ||
      !this.willRegisterMandateOnFirstCharge({
        amount: params.amount,
        productMandateMaxAmount: params.productMandateMaxAmount,
      })
    ) {
      return null;
    }
    try {
      return await this.startAuthorization({
        subscription: params.subscription,
        customer: params.customer,
        actor: params.actor,
        authorizationAmount: params.amount,
        method: params.method,
        notes: params.notes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        { subscriptionId: params.subscription.id, error: message },
        'First payment could not register AutoPay',
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException({
        code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
        message:
          'AutoPay could not be started, so this subscription was not charged. Check the Razorpay recurring setup and try again.',
      });
    }
  }

  findByGatewayMandateId(gatewayMandateId: string) {
    return this.mandatesRepository.findByGatewayMandateId(gatewayMandateId);
  }

  async confirmFromAuthorizationPayment(params: {
    gatewayOrderId?: string | null;
    gatewayPaymentId?: string | null;
    actor: string;
  }): Promise<void> {
    if (!params.gatewayOrderId) return;
    const mandate = await this.mandatesRepository.findByAuthorizationOrderId(params.gatewayOrderId);
    if (!mandate) return;
    const adapter = this.adapter(mandate.provider);
    if (!adapter.isConfigured()) return;
    const snapshot = await adapter.fetchMandateStatus({
      gatewayPaymentId: params.gatewayPaymentId,
      gatewayCustomerId: mandate.gatewayCustomerId,
      gatewayMandateId: mandate.gatewayMandateId,
      gatewaySubscriptionId: mandate.gatewaySubscriptionId ?? mandate.authorizationOrderId,
    });
    await this.applyStatusSnapshot({
      mandateId: mandate.id,
      status: snapshot.status,
      gatewayMandateId: snapshot.gatewayMandateId,
      gatewayPaymentId: params.gatewayPaymentId,
      actor: params.actor,
      raw: snapshot.raw,
    });
  }

  async firstChargePaymentIdIfReady(gatewaySubscriptionId: string): Promise<string | null> {
    if (!gatewaySubscriptionId) return null;
    const mandate =
      (await this.mandatesRepository.findByGatewaySubscriptionId(gatewaySubscriptionId)) ??
      (await this.mandatesRepository.findByAuthorizationOrderId(gatewaySubscriptionId));
    if (!mandate || !isMandateAutopayReady(mandate.status)) return null;
    if (mandate.consentEvidence?.firstCharge !== true) return null;
    const paymentId = mandate.consentEvidence.subscriptionPaymentId;
    return typeof paymentId === 'string' && paymentId ? paymentId : null;
  }

  /**
   * Razorpay card mandates capture ₹1 first. Returns the mandate when this
   * webhook is that authorisation and the product amount still has to be charged.
   * A repeat of the ₹1 event, after the product charge has started, returns 'wait'
   * so the ₹1 capture is not treated as the product payment.
   */
  async cardAuthorizationAction(
    gatewayOrderId?: string | null,
  ): Promise<{ action: 'charge'; mandate: SubscriptionMandateEntity } | { action: 'wait' } | { action: 'none' }> {
    if (!gatewayOrderId) return { action: 'none' };
    const mandate = await this.mandatesRepository.findByAuthorizationOrderId(gatewayOrderId);
    if (!mandate || mandate.consentEvidence?.cardAuthOnly !== true) return { action: 'none' };
    if (mandate.consentEvidence?.productChargeOrderId || mandate.consentEvidence?.productChargeStartedAt) {
      return { action: 'wait' };
    }
    await this.mandatesRepository.updateById(mandate.id, {
      consentEvidence: {
        ...mandate.consentEvidence,
        productChargeStartedAt: new Date().toISOString(),
      },
    });
    return { action: 'charge', mandate };
  }

  async chargeCardProduct(params: {
    mandateId: string;
    amount: string;
    customer: { email?: string | null; phone: string };
    notes: Record<string, string>;
    actor: string;
    receipt: string;
  }): Promise<AutopayChargeResult> {
    const mandate = await this.mandatesRepository.findById(params.mandateId);
    if (!mandate?.gatewayCustomerId || !mandate.gatewayMandateId) {
      await this.releaseCardChargeClaim(mandate);
      return { accepted: false, pending: true, failureReason: 'Card token is not confirmed yet' };
    }
    if (!params.customer.phone) {
      await this.releaseCardChargeClaim(mandate);
      return { accepted: false, pending: false, failureReason: 'Customer phone is required to charge the card' };
    }
    const result = await this.adapter(mandate.provider).charge({
      gatewayCustomerId: mandate.gatewayCustomerId,
      gatewayMandateId: mandate.gatewayMandateId,
      gatewaySubscriptionId: mandate.gatewaySubscriptionId,
      amount: params.amount,
      receipt: params.receipt,
      idempotencyKey: params.receipt,
      customer: params.customer,
      notes: params.notes,
    }).catch(async (error: unknown): Promise<AutopayChargeResult> => {
      await this.releaseCardChargeClaim(mandate);
      const message = error instanceof Error ? error.message : String(error);
      return {
        accepted: false,
        pending: false,
        failureReason: message,
      };
    });
    if (result.gatewayOrderId) {
      await this.mandatesRepository.updateById(mandate.id, {
        consentEvidence: {
          ...(mandate.consentEvidence ?? {}),
          productChargeStartedAt: new Date().toISOString(),
          productChargeOrderId: result.gatewayOrderId,
        },
        updatedBy: params.actor,
      });
      return result;
    }
    await this.releaseCardChargeClaim(mandate);
    return result;
  }

  private async releaseCardChargeClaim(mandate: SubscriptionMandateEntity | null): Promise<void> {
    if (!mandate?.consentEvidence) return;
    const evidence = { ...mandate.consentEvidence };
    delete evidence.productChargeStartedAt;
    await this.mandatesRepository.updateById(mandate.id, { consentEvidence: evidence });
  }

  private configuredMandateProvider(): SubscriptionMandateProvider | null {
    const pinned = this.pinnedProviderIfConfigured();
    if (pinned) return pinned;
    if (this.razorpay.isConfigured()) return SubscriptionMandateProvider.RAZORPAY;
    if (this.cashfree.isConfigured()) return SubscriptionMandateProvider.CASHFREE;
    return null;
  }

  private resolveNewMandateProvider(): SubscriptionMandateProvider {
    const pinned = this.pinnedProviderIfConfigured();
    if (pinned) return pinned;
    const configured = this.configService.get<string>('subscriptions.autopayProvider');
    if (configured === SubscriptionMandateProvider.CASHFREE && this.razorpay.isConfigured()) {
      return SubscriptionMandateProvider.RAZORPAY;
    }
    if (configured === SubscriptionMandateProvider.RAZORPAY && this.cashfree.isConfigured()) {
      return SubscriptionMandateProvider.CASHFREE;
    }
    if (this.razorpay.isConfigured()) return SubscriptionMandateProvider.RAZORPAY;
    if (this.cashfree.isConfigured()) return SubscriptionMandateProvider.CASHFREE;
    throw new BadRequestException({
      code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
      message: 'No AutoPay provider is configured',
    });
  }

  private pinnedProviderIfConfigured(): SubscriptionMandateProvider | null {
    const configured = this.configService.get<string>('subscriptions.autopayProvider');
    if (configured === SubscriptionMandateProvider.CASHFREE && this.cashfree.isConfigured()) {
      return SubscriptionMandateProvider.CASHFREE;
    }
    if (configured === SubscriptionMandateProvider.RAZORPAY && this.razorpay.isConfigured()) {
      return SubscriptionMandateProvider.RAZORPAY;
    }
    return null;
  }
}
