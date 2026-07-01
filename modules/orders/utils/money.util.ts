export const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

export const toMoneyString = (value: number): string => roundMoney(value).toFixed(2);

export const parseMoney = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : parseFloat(value);
};
