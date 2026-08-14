export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Indian currency short format: ₹ 2.85 Cr / ₹ 18.6 L / ₹ 865 */
export function formatInr(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_00_00_000) {
    return `${sign}₹ ${(abs / 1_00_00_000).toFixed(2)} Cr`;
  }
  if (abs >= 1_00_000) {
    return `${sign}₹ ${(abs / 1_00_000).toFixed(1)} L`;
  }
  return `${sign}₹ ${Math.round(abs).toLocaleString('en-IN')}`;
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

export function formatPercent(value: number, digits = 1): string {
  return `${round2(value).toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const rounded = round2(value);
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded.toFixed(digits)}%`;
}

export function changePercentage(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return round2(((current - previous) / previous) * 100);
}

export function relativeTime(from: Date, now = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - from.getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function previousPeriodRange(
  start: Date,
  end: Date,
): { start: Date; end: Date } {
  const durationMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);
  return { start: prevStart, end: prevEnd };
}

export function buildKpiMetric(params: {
  valueFormatted: string;
  rawValue: number;
  current: number;
  previous: number;
  comparisonPeriodLabel?: string;
}) {
  const change = changePercentage(params.current, params.previous);
  return {
    value: params.valueFormatted,
    rawValue: params.rawValue,
    changePercentage: change,
    isPositive: change >= 0,
    comparisonPeriodLabel: params.comparisonPeriodLabel ?? 'vs previous period',
  };
}
