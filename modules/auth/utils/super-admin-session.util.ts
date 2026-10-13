import { BadRequestException } from '@nestjs/common';

export const SUPER_ADMIN_SESSION_EMAIL = 'superadmin@cureka.com';
export const SUPER_ADMIN_SESSION_LIMIT = 3;
export const SUPER_ADMIN_SESSION_LIMIT_MESSAGE =
  'Maximum 3 active sessions allowed. Please log out from an existing session before logging in again.';

export const ACTIVE_ADMIN_SESSION_PREDICATE = 'revoked_at IS NULL AND expires_at > now()';

export function isSuperAdminSessionAccount(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === SUPER_ADMIN_SESSION_EMAIL;
}

/**
 * Converts the same `jwt.expiresIn` string used by JwtModule into milliseconds.
 * Numeric strings follow the `ms` package (no unit means milliseconds), which is
 * what jsonwebtoken uses when `expiresIn` is a string.
 */
export function parseJwtExpiresInToMilliseconds(expiresIn: string): number | undefined {
  const match =
    /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
      expiresIn.trim(),
    );
  if (!match) return undefined;
  const value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const unit = (match[2] ?? 'ms').toLowerCase();
  const second = 1000;
  const minute = second * 60;
  const hour = minute * 60;
  const day = hour * 24;
  const week = day * 7;
  const year = day * 365.25;
  const scale =
    unit === 'ms' || unit.startsWith('msec') || unit.startsWith('millisecond')
      ? 1
      : unit === 's' || unit.startsWith('sec') || unit.startsWith('second')
        ? second
        : unit === 'm' || unit.startsWith('min')
          ? minute
          : unit === 'h' || unit.startsWith('hour') || unit.startsWith('hr')
            ? hour
            : unit === 'd' || unit.startsWith('day')
              ? day
              : unit === 'w' || unit.startsWith('week')
                ? week
                : year;
  return value * scale;
}

export interface AdminSessionAllocation {
  lockAdminUser(adminUserId: string): Promise<void>;
  countActive(adminUserId: string): Promise<number>;
  insertActive(adminUserId: string, expiresAt: Date): Promise<string>;
}

export async function allocateSuperAdminSessionSlot(
  tx: AdminSessionAllocation,
  adminUserId: string,
  expiresAt: Date,
): Promise<string> {
  await tx.lockAdminUser(adminUserId);
  const active = await tx.countActive(adminUserId);
  if (active >= SUPER_ADMIN_SESSION_LIMIT) {
    throw new BadRequestException(SUPER_ADMIN_SESSION_LIMIT_MESSAGE);
  }
  return tx.insertActive(adminUserId, expiresAt);
}
