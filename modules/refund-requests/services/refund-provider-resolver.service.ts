import { Injectable } from '@nestjs/common';
import { GokwikRepository } from '@modules/gokwik/repositories/gokwik.repository';
import { OrderEntity } from '@modules/orders/entities/order.entity';
import { OrderPaymentMethod } from '@modules/orders/enums/order-payment-method.enum';
import { OrderPaymentStatus } from '@modules/orders/enums/order-payment-status.enum';
import { parseMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { PaymentRequestStatus } from '@modules/payment-requests/enums/payment-request-status.enum';
import { PaymentRequestsRepository } from '@modules/payment-requests/repositories/payment-requests.repository';
import { RefundPaymentProvider } from '../enums/refund-payment-provider.enum';
import { IRefundProviderResolution } from '../interfaces/refund-request.interface';
import { paiseToRupees } from '../utils/wallet-money.util';

const PAYMENT_REQUEST_REF_PATTERN = /Generated from payment request ([A-Z0-9]+)/i;

@Injectable()
export class RefundProviderResolverService {
  constructor(
    private readonly gokwikRepository: GokwikRepository,
    private readonly paymentRequestsRepository: PaymentRequestsRepository,
  ) {}

  async resolve(order: OrderEntity): Promise<IRefundProviderResolution> {
    const gokwik = await this.gokwikRepository.findOrderByOrderId(order.id);
    if (gokwik) {
      const prepaid = parseMoney(gokwik.prepaidAmount);
      const captured =
        order.paymentMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
          ? prepaid
          : parseMoney(gokwik.paymentAmount || order.grandTotal);
      return {
        paymentProvider: RefundPaymentProvider.GOKWIK,
        originalPaymentMethod: order.paymentMethod,
        providerPaymentId: gokwik.paymentId,
        paymentRequestId: null,
        capturedAmount: toMoneyString(captured),
        identifiable: true,
      };
    }

    if (order.paymentMethod === OrderPaymentMethod.COD) {
      return {
        paymentProvider: RefundPaymentProvider.COD,
        originalPaymentMethod: order.paymentMethod,
        providerPaymentId: null,
        paymentRequestId: null,
        capturedAmount: '0.00',
        identifiable: true,
      };
    }

    if (order.paymentMethod === OrderPaymentMethod.WALLET) {
      const walletPaise = Number(order.walletAmountPaise ?? 0);
      const captured =
        Number.isFinite(walletPaise) && walletPaise > 0
          ? paiseToRupees(walletPaise)
          : toMoneyString(parseMoney(order.grandTotal));
      return {
        paymentProvider: RefundPaymentProvider.WALLET,
        originalPaymentMethod: order.paymentMethod,
        providerPaymentId: null,
        paymentRequestId: order.paymentRequestId ?? null,
        capturedAmount: captured,
        identifiable: true,
      };
    }

    const paymentRequest = await this.findNativePaymentRequest(order);
    if (paymentRequest) {
      const provider = this.mapProvider(paymentRequest.paymentProvider, order.paymentMethod);
      const gatewayCaptured =
        paymentRequest.status === PaymentRequestStatus.PAID
          ? paymentRequest.totalAmount
          : '0.00';
      return {
        paymentProvider: provider,
        originalPaymentMethod: order.paymentMethod,
        providerPaymentId: paymentRequest.paymentReference,
        paymentRequestId: paymentRequest.id,
        capturedAmount: gatewayCaptured,
        identifiable: provider !== RefundPaymentProvider.OTHER,
        unresolvedReason:
          provider === RefundPaymentProvider.OTHER
            ? 'Payment provider on the captured transaction is not a supported refund source'
            : undefined,
      };
    }

    if (
      order.paymentMethod === OrderPaymentMethod.RAZORPAY ||
      order.paymentMethod === OrderPaymentMethod.CASHFREE
    ) {
      return {
        paymentProvider:
          order.paymentMethod === OrderPaymentMethod.CASHFREE
            ? RefundPaymentProvider.CASHFREE
            : RefundPaymentProvider.RAZORPAY,
        originalPaymentMethod: order.paymentMethod,
        providerPaymentId: null,
        paymentRequestId: order.paymentRequestId ?? null,
        capturedAmount: this.isCaptured(order.paymentStatus) ? order.grandTotal : '0.00',
        identifiable: false,
        unresolvedReason:
          'Original gateway payment identifier was not found on a paid payment request',
      };
    }

    return {
      paymentProvider: RefundPaymentProvider.OTHER,
      originalPaymentMethod: order.paymentMethod,
      providerPaymentId: null,
      paymentRequestId: order.paymentRequestId ?? null,
      capturedAmount: '0.00',
      identifiable: false,
      unresolvedReason: 'Original successful payment source could not be identified',
    };
  }

  private async findNativePaymentRequest(order: OrderEntity) {
    if (order.paymentRequestId) {
      const byId = await this.paymentRequestsRepository.findById(order.paymentRequestId);
      if (byId && byId.status === PaymentRequestStatus.PAID) {
        return byId;
      }
    }

    const fromNotes = order.notes?.match(PAYMENT_REQUEST_REF_PATTERN)?.[1];
    if (fromNotes) {
      const byRef = await this.paymentRequestsRepository.findPaidByRefId(fromNotes.toUpperCase());
      if (byRef) {
        return byRef;
      }
    }

    const byOrderNumber = await this.paymentRequestsRepository.findPaidByPaymentReference(
      order.orderNumber,
    );
    if (byOrderNumber) {
      return byOrderNumber;
    }

    const gatewayPaise = Number(order.gatewayAmountPaise ?? 0);
    const lookupAmount =
      Number.isFinite(gatewayPaise) && gatewayPaise > 0
        ? paiseToRupees(gatewayPaise)
        : order.grandTotal;

    return this.paymentRequestsRepository.findLatestPaidForCustomerAmount(
      order.userId,
      lookupAmount,
    );
  }

  private mapProvider(
    paymentProvider: string,
    orderMethod: OrderPaymentMethod,
  ): RefundPaymentProvider {
    const normalized = paymentProvider.trim().toUpperCase();
    // Order tender wins over a mismatched payment-request provider (e.g. amount
    // fallback matched another customer's PAID COD-like row).
    if (orderMethod === OrderPaymentMethod.CASHFREE) return RefundPaymentProvider.CASHFREE;
    if (orderMethod === OrderPaymentMethod.RAZORPAY) return RefundPaymentProvider.RAZORPAY;
    if (orderMethod === OrderPaymentMethod.WALLET) return RefundPaymentProvider.WALLET;
    if (
      orderMethod === OrderPaymentMethod.GOKWIK_PREPAID ||
      orderMethod === OrderPaymentMethod.GOKWIK_PARTIAL_COD
    ) {
      return RefundPaymentProvider.GOKWIK;
    }
    if (normalized === 'GOKWIK') return RefundPaymentProvider.GOKWIK;
    if (normalized === 'RAZORPAY') return RefundPaymentProvider.RAZORPAY;
    if (normalized === 'CASHFREE') return RefundPaymentProvider.CASHFREE;
    if (normalized === 'COD') return RefundPaymentProvider.COD;
    if (normalized === 'WALLET') return RefundPaymentProvider.WALLET;
    return RefundPaymentProvider.OTHER;
  }

  private isCaptured(status: OrderPaymentStatus): boolean {
    return (
      status === OrderPaymentStatus.PAID ||
      status === OrderPaymentStatus.PARTIALLY_PAID ||
      status === OrderPaymentStatus.PARTIALLY_REFUNDED ||
      status === OrderPaymentStatus.REFUND_PENDING
    );
  }
}
