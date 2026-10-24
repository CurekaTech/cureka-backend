/**
 * Monthly and longer tenures stay date-only so a cycle is idempotent for that day.
 * Short TechBV tenures include the slot, otherwise every charge
 * on the same day would reuse one payment row.
 */
export function buildBillingCycleRef(date: Date, frequency?: string | null): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const base = `${year}-${month}-${day}`;
  if (frequency === 'MINUTES_2' || frequency === 'MINUTES_5') {
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    return `${base}T${hour}${minute}Z`;
  }
  if (frequency === 'MINUTES_30') {
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = date.getUTCMinutes() < 30 ? '00' : '30';
    return `${base}T${hour}${minute}Z`;
  }
  if (frequency === 'HOURLY') {
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${base}T${hour}00Z`;
  }
  return base;
}
