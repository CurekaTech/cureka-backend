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
    const gokwikRefunded = await this.gokwikRepository.sumSuccessfulOrPendingRefunds(order.id);
    const requestHeld = await this.refundRequestsRepository.sumActiveAmountsForOrder(
      order.id,
      excludingRefundRequestId,
    );
    const paidCodPayouts = await this.payoutsRepository.sumPaidAmountsForOrder(order.id);

    const includeCod = options.includeCodCollected === true;
    const totalCaptured = includeCod
      ? roundMoney(this.totalCollected(order, onlineCaptured))
      : onlineCaptured;

    const alreadyRefunded = roundMoney(gokwikRefunded + paidCodPayouts);
    const pendingRefundAmount = roundMoney(Math.max(0, requestHeld - alreadyRefunded));
    const refundableAmount = roundMoney(
      Math.max(0, totalCaptured - alreadyRefunded - pendingRefundAmount),
    );

    const requiresOnlineRefund =
      onlineCaptured > 0 &&
      resolution.paymentProvider !== RefundPaymentProvider.COD &&
      this.hasCapturedOnlinePayment(order);

    const onlineRefundableAmount = requiresOnlineRefund
      ? roundMoney(Math.max(0, onlineCaptured - gokwikRefunded))
      : 0;
    const codRefundableAmount = includeCod
      ? roundMoney(Math.max(0, refundableAmount - onlineRefundableAmount))
      : 0;

    return {
      capturedAmount: toMoneyString(includeCod ? totalCaptured : onlineCaptured),
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
    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return false;
    }
    return (
      order.paymentStatus === OrderPaymentStatus.PAID ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_PAID ||
      order.paymentStatus === OrderPaymentStatus.PARTIALLY_REFUNDED ||
      order.paymentStatus === OrderPaymentStatus.REFUND_PENDING
    );
  }

  private totalCollected(order: OrderEntity, onlineCaptured: number): number {
    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return parseMoney(order.grandTotal);
    }
    if (order.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD) {
      return Math.max(parseMoney(order.grandTotal), onlineCaptured);
    }
    if (order.paymentMethod === OrderPaymentMethod.WALLET) {
      return parseMoney(order.grandTotal);
    }
    return onlineCaptured;
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
