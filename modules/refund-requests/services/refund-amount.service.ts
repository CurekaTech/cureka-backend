import { Injectable } from '@nestjs/common';
import { GokwikRepository } from '@modules/gokwik/repositories/gokwik.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { IRefundableAmountBreakdown } from '../interfaces/refund-request.interface';
import { CodRefundPayoutsRepository } from '../repositories/cod-refund-payouts.repository';
import { RefundRequestsRepository } from '../repositories/refund-requests.repository';
import { paiseToRupees } from '../utils/wallet-money.util';
import { RefundProviderResolverService } from './refund-provider-resolver.service';

export type RefundableAmountOptions = {
  includeCodCollected?: boolean;
};

@Injectable()
export class RefundAmountService {
  constructor(
    private readonly refundRequestsRepository: RefundRequestsRepository,
    private readonly gokwikRepository: GokwikRepository,
    private readonly providerResolver: RefundProviderResolverService,
    private readonly payoutsRepository: CodRefundPayoutsRepository,
  ) {}

  async calculateRefundableAmount(
    order: OrderEntity,
    excludingRefundRequestId?: string,
    options: RefundableAmountOptions = {},
  ): Promise<IRefundableAmountBreakdown> {
    const resolution = await this.providerResolver.resolve(order);
    const onlineCaptured = roundMoney(parseMoney(resolution.capturedAmount));
    const walletCaptured = this.walletCapturedAmount(order, resolution);
    const gokwikRefunded = await this.gokwikRepository.sumSuccessfulOrPendingRefunds(order.id);
    const requestHeld = await this.refundRequestsRepository.sumActiveAmountsForOrder(
      order.id,
      excludingRefundRequestId,
    );
    const paidCodPayouts = await this.payoutsRepository.sumPaidAmountsForOrder(order.id);

    const includeCod = options.includeCodCollected === true;
    // Hybrid/native wallet: onlineCaptured is gateway-only; add wallet tender separately.
    // Pure WALLET resolver already returns wallet as capturedAmount — avoid double-counting.
    const walletAddon =
      resolution.paymentProvider === RefundPaymentProvider.WALLET ? 0 : walletCaptured;
    const prepaidAndWallet = roundMoney(onlineCaptured + walletAddon);
    const totalCaptured = includeCod
      ? roundMoney(this.totalCollected(order, prepaidAndWallet))
      : prepaidAndWallet;

    const alreadyRefunded = roundMoney(gokwikRefunded + paidCodPayouts);
    const pendingRefundAmount = roundMoney(Math.max(0, requestHeld - alreadyRefunded));
    const refundableAmount = roundMoney(
      Math.max(0, totalCaptured - alreadyRefunded - pendingRefundAmount),
    );

    const requiresOnlineRefund =
      onlineCaptured > 0 &&
      resolution.paymentProvider !== RefundPaymentProvider.COD &&
      resolution.paymentProvider !== RefundPaymentProvider.WALLET &&
      this.hasCapturedOnlinePayment(order);

    const onlineRefundableAmount = requiresOnlineRefund
      ? roundMoney(Math.max(0, onlineCaptured - gokwikRefunded))
      : 0;
    const codRefundableAmount = includeCod
      ? roundMoney(Math.max(0, refundableAmount - onlineRefundableAmount - walletCaptured))
      : 0;

    return {
      capturedAmount: toMoneyString(totalCaptured),
      alreadyRefundedAmount: toMoneyString(alreadyRefunded),
      pendingRefundAmount: toMoneyString(pendingRefundAmount),
      refundableAmount: toMoneyString(refundableAmount),
      currency: 'INR',
      requiresOnlineRefund,
      requiresCodPayout: includeCod && codRefundableAmount > 0,
      onlineRefundableAmount: toMoneyString(onlineRefundableAmount),
      codRefundableAmount: toMoneyString(Math.max(0, codRefundableAmount)),
    };
  }

  hasCapturedOnlinePayment(order: OrderEntity): boolean {
    if (
      order.paymentMethod === OrderPaymentMethod.COD ||
      order.paymentMethod === OrderPaymentMethod.WALLET
    ) {
      return false;
    }
    return (
      order.paymentStatus === OrderPaymentStatus.PAID ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_PAID ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED ||
      order.paymentStatus === OrderPaymentStatus.REFUND_PENDING
    );
  }

  private walletCapturedAmount(
    order: OrderEntity,
    resolution: { paymentProvider: RefundPaymentProvider; capturedAmount: string },
  ): number {
    const walletPaise = Number(order.walletAmountPaise ?? 0);
    if (Number.isFinite(walletPaise) && walletPaise > 0) {
      return roundMoney(parseMoney(paiseToRupees(walletPaise)));
    }
    if (resolution.paymentProvider === RefundPaymentProvider.WALLET) {
      return roundMoney(parseMoney(resolution.capturedAmount));
    }
    if (order.paymentMethod === OrderPaymentMethod.WALLET) {
      return roundMoney(parseMoney(order.grandTotal));
    }
    return 0;
  }

  private totalCollected(order: OrderEntity, prepaidAndWallet: number): number {
    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return parseMoney(order.grandTotal);
    }
    if (order.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD) {
      return Math.max(parseMoney(order.grandTotal), prepaidAndWallet);
    }
    if (order.paymentMethod === OrderPaymentMethod.WALLET) {
      return Math.max(parseMoney(order.grandTotal), prepaidAndWallet);
    }
    return prepaidAndWallet;
  }

  private codCollectedAmount(order: OrderEntity, onlineCaptured: string): number {
    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return parseMoney(order.grandTotal);
    }
    if (order.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD) {
      return Math.max(0, roundMoney(parseMoney(order.grandTotal) - parseMoney(onlineCaptured)));
    }
    return 0;
  }
}
