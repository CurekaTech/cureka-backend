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
import { MandateAuthSession } from '../interfaces/subscription-mandate-provider.interface';
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
    if (sub.renewalMethod !== SubscriptionRenewalMethod.AUTO_PAY) return false;
    if (!mandate) return false;
    return isMandateAutopayReady(mandate.status);
  }

  async startAuthorization(params: {
    subscription: UserProductSubscriptionEntity;
    customer: { name?: string; email?: string | null; phone: string };
    actor: string;
    returnUrl?: string;
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
      notes: {
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

  private resolveNewMandateProvider(): SubscriptionMandateProvider {
    const configured = this.configService.get<string>('subscriptions.autopayProvider');
    if (configured === SubscriptionMandateProvider.CASHFREE) return SubscriptionMandateProvider.CASHFREE;
    if (configured === SubscriptionMandateProvider.RAZORPAY) return SubscriptionMandateProvider.RAZORPAY;
    if (this.razorpay.isConfigured()) return SubscriptionMandateProvider.RAZORPAY;
    if (this.cashfree.isConfigured()) return SubscriptionMandateProvider.CASHFREE;
    throw new BadRequestException({
      code: SUBSCRIPTION_ERROR.AUTOPAY_UNAVAILABLE,
      message: 'No AutoPay provider is configured',
    });
  }
}
