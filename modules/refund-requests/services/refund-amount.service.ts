import { Injectable } from '@nestjs/common';
import { GokwikRepository } from '@modules/gokwik/repositories/gokwik.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { IRefundableAmountBreakdown } from '../interfaces/refund-request.interface';
import { RefundRequestsRepository } from '../repositories/refund-requests.repository';
import { RefundProviderResolverService } from './refund-provider-resolver.service';

@Injectable()
export class RefundAmountService {
  constructor(
    private readonly refundRequestsRepository: RefundRequestsRepository,
    private readonly gokwikRepository: GokwikRepository,
    private readonly providerResolver: RefundProviderResolverService,
  ) {}

  async calculateRefundableAmount(
    order: OrderEntity,
    excludingRefundRequestId?: string,
  ): Promise<IRefundableAmountBreakdown> {
    const resolution = await this.providerResolver.resolve(order);
    const captured = roundMoney(parseMoney(resolution.capturedAmount));
    const gokwikRefunded = await this.gokwikRepository.sumSuccessfulOrPendingRefunds(order.id);
    const requestHeld = await this.refundRequestsRepository.sumActiveAmountsForOrder(
      order.id,
      excludingRefundRequestId,
    );

    const alreadyRefunded = roundMoney(gokwikRefunded);
    const pendingRefundAmount = roundMoney(Math.max(0, requestHeld - alreadyRefunded));
    const refundableAmount = roundMoney(
      Math.max(0, captured - alreadyRefunded - pendingRefundAmount),
    );

    const requiresOnlineRefund =
      captured > 0 &&
      resolution.paymentProvider !== RefundPaymentProvider.COD &&
      this.hasCapturedOnlinePayment(order);

    return {
      capturedAmount: toMoneyString(captured),
      alreadyRefundedAmount: toMoneyString(alreadyRefunded),
      pendingRefundAmount: toMoneyString(pendingRefundAmount),
      refundableAmount: toMoneyString(refundableAmount),
      currency: 'INR',
      requiresOnlineRefund,
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
}
