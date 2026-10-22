import { BadRequestException } from '@nestjs/common';

/** Convert the existing INR decimal API/database representation to exact paise. */
export function rupeesToPaise(value: string | number): number {
  const input = typeof value === 'number' ? value.toString() : value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!match) {
    throw new BadRequestException('Invalid INR amount');
  }

  const sign = match[1] === '-' ? -1 : 1;
  const whole = Number(match[2]);
  const fraction = match[3] ?? '';
  if (!Number.isSafeInteger(whole)) {
    throw new BadRequestException('INR amount is outside the supported range');
  }

  // Round half up to the nearest paise without binary floating-point math.
  const cents = (fraction + '00').slice(0, 2);
  const roundUp = fraction.length > 2 && fraction[2] >= '5' ? 1 : 0;
  const paise = (whole * 100 + Number(cents) + roundUp) * sign;
  if (!Number.isSafeInteger(paise)) {
    throw new BadRequestException('INR amount is outside the supported range');
  }
  return paise;
}

/** Convert integer paise to the existing fixed two-decimal INR representation. */
export function paiseToRupees(value: number | string): string {
  const paise = typeof value === 'number'
    ? value
    : /^[+-]?\d+$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(paise)) {
    throw new BadRequestException('Paise amount must be a safe integer');
  }
  const sign = paise < 0 ? '-' : '';
  const absolute = Math.abs(paise);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}
