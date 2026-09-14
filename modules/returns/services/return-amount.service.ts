import { OrderEntity } from '@modules/orders/entities/order.entity';
import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';
import { RefundAmountService } from '@modules/refund-requests/services/refund-amount.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RETURN_CURRENCY } from '../constants/return.constants';
import {
  IReturnAmountBreakdown,
  IReturnItemAmountBreakdown,
} from '../interfaces/return-amount-breakdown.interface';
import { allocateReturnAmounts } from '../utils/return-amount-allocation.util';

export interface IReturnLineSelection {
  orderItemId: string;
  quantity: number;
}

/**
 * Computes the refundable value of a return.
 *
 * Order items carry only `unitPrice`/`totalPrice`; discounts, coupons and prepaid
 * discounts live at order level, so a partial return needs proportional
 * allocation. The result is stored on the return request as an immutable
 * breakdown so the customer-facing estimate and the eventual refund agree.
 */
@Injectable()
export class ReturnAmountService {
  constructor(
    private readonly refundAmountService: RefundAmountService,
    private readonly configService: ConfigService,
  ) {}

  async calculate(
    order: OrderEntity,
    selections: IReturnLineSelection[],
    options?: { excludingRefundRequestId?: string },
  ): Promise<IReturnAmountBreakdown> {
    const orderItems = order.items ?? [];
    const selectionByItemId = new Map(
      selections.map((selection) => [selection.orderItemId, selection.quantity]),
    );

    const lines = orderItems
      .filter((item) => selectionByItemId.has(item.id))
      .map((item) => ({
        orderItemId: item.id,
        lineTotal: item.totalPrice,
        returnQuantity: selectionByItemId.get(item.id) ?? 0,
        orderedQuantity: item.quantity,
        unitPrice: item.unitPrice,
      }));

    const subtotal = toMoneyString(
      roundMoney(orderItems.reduce((sum, item) => sum + parseMoney(item.totalPrice), 0)),
    );

    const allocated = allocateReturnAmounts(
      {
        subtotal,
        discountAmount: order.discountAmount,
        shippingAmount: order.shippingAmount,
        handlingAmount: order.handlingAmount,
        codCharge: order.codCharge,
        prepaidDiscount: order.prepaidDiscount,
      },
      lines,
    );

    const itemsNetAmount = roundMoney(
      allocated.reduce((sum, line) => sum + line.netAmount, 0),
    );

    const isFullOrderReturn = orderItems.every(
      (item) => (selectionByItemId.get(item.id) ?? 0) >= item.quantity,
    );
    const rules = this.chargeRules();
    const charge = (amount: string, refundable: boolean): number =>
      refundable && isFullOrderReturn ? roundMoney(parseMoney(amount)) : 0;

    const shippingRefundAmount = charge(order.shippingAmount, rules.shippingRefundable);
    const codFeeRefundAmount = charge(order.codCharge, rules.codFeeRefundable);
    const handlingRefundAmount = charge(order.handlingAmount, rules.handlingRefundable);

    const nonRefundableChargesAmount = roundMoney(
      parseMoney(order.shippingAmount) +
        parseMoney(order.codCharge) +
        parseMoney(order.handlingAmount) +
        parseMoney(order.platformFee) -
        shippingRefundAmount -
        codFeeRefundAmount -
        handlingRefundAmount,
    );

    const computedRefundAmount = roundMoney(
      itemsNetAmount + shippingRefundAmount + codFeeRefundAmount + handlingRefundAmount,
    );

    const orderBreakdown = await this.refundAmountService.calculateRefundableAmount(
      order,
      options?.excludingRefundRequestId,
      { includeCodCollected: true },
    );
    const headroom = roundMoney(parseMoney(orderBreakdown.refundableAmount));
    // Never refund more than what remains of the captured amount.
    const refundableAmount = roundMoney(Math.min(computedRefundAmount, Math.max(0, headroom)));

    const orderItemsById = new Map(orderItems.map((item) => [item.id, item]));
    const items: IReturnItemAmountBreakdown[] = allocated.map((line) => ({
      returnRequestItemId: null,
      orderItemId: line.orderItemId,
      sku: orderItemsById.get(line.orderItemId)?.sku ?? '',
      quantity: selectionByItemId.get(line.orderItemId) ?? 0,
      unitPrice: orderItemsById.get(line.orderItemId)?.unitPrice ?? '0.00',
      grossAmount: toMoneyString(line.grossAmount),
      discountAllocation: toMoneyString(line.discountAllocation),
      couponAllocation: toMoneyString(line.couponAllocation),
      prepaidDiscountAllocation: toMoneyString(line.prepaidDiscountAllocation),
      netAmount: toMoneyString(line.netAmount),
    }));

    return {
      itemsNetAmount: toMoneyString(itemsNetAmount),
      shippingRefundAmount: toMoneyString(shippingRefundAmount),
      codFeeRefundAmount: toMoneyString(codFeeRefundAmount),
      handlingRefundAmount: toMoneyString(handlingRefundAmount),
      nonRefundableChargesAmount: toMoneyString(Math.max(0, nonRefundableChargesAmount)),
      computedRefundAmount: toMoneyString(computedRefundAmount),
      refundableAmount: toMoneyString(refundableAmount),
      orderCapturedAmount: orderBreakdown.capturedAmount,
      orderAlreadyRefundedAmount: orderBreakdown.alreadyRefundedAmount,
      orderPendingRefundAmount: orderBreakdown.pendingRefundAmount,
      cappedByCapturedAmount: refundableAmount < computedRefundAmount,
      currency: RETURN_CURRENCY,
      items,
      rules: {
        shippingRefundable: rules.shippingRefundable,
        codFeeRefundable: rules.codFeeRefundable,
        handlingRefundable: rules.handlingRefundable,
        roundingMode: 'HALF_UP_2DP',
      },
      calculatedAt: new Date().toISOString(),
    };
  }

  private chargeRules(): {
    shippingRefundable: boolean;
    codFeeRefundable: boolean;
    handlingRefundable: boolean;
  } {
    return {
      shippingRefundable:
        this.configService.get<boolean>('returns.charges.shippingRefundable') ?? false,
      codFeeRefundable:
        this.configService.get<boolean>('returns.charges.codFeeRefundable') ?? false,
      handlingRefundable:
        this.configService.get<boolean>('returns.charges.handlingRefundable') ?? false,
    };
  }
}
