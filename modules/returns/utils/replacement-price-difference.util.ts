import { parseMoney, roundMoney, toMoneyString } from '@modules/orders/utils/money.util';

export type ReplacementSettlement = 'NONE' | 'COLLECT' | 'REFUND';

export interface IReplacementPriceDifference {
  originalAmount: string;
  replacementAmount: string;
  differenceAmount: string;
  settlement: ReplacementSettlement;
}

/**
 * Settlement is the full difference. A later tolerance would wrap this
 * function. It is not applied here.
 */
export const calculateReplacementPriceDifference = (
  originalAmount: number,
  replacementAmount: number,
): IReplacementPriceDifference => {
  const original = roundMoney(originalAmount);
  const replacement = roundMoney(replacementAmount);
  const delta = roundMoney(replacement - original);
  if (delta > 0) {
    return {
      originalAmount: toMoneyString(original),
      replacementAmount: toMoneyString(replacement),
      differenceAmount: toMoneyString(delta),
      settlement: 'COLLECT',
    };
  }
  if (delta < 0) {
    return {
      originalAmount: toMoneyString(original),
      replacementAmount: toMoneyString(replacement),
      differenceAmount: toMoneyString(Math.abs(delta)),
      settlement: 'REFUND',
    };
  }
  return {
    originalAmount: toMoneyString(original),
    replacementAmount: toMoneyString(replacement),
    differenceAmount: toMoneyString(0),
    settlement: 'NONE',
  };
};

export const sumMoney = (amounts: string[]): number =>
  roundMoney(amounts.reduce((total, amount) => total + parseMoney(amount), 0));
