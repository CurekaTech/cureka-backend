import { BadRequestException } from '@nestjs/common';

const MIN_BIRTH_YEAR = 1900;

/**
 * Parse an ISO date string (YYYY-MM-DD or full ISO) and reject future / pre-1900 dates.
 * Returns a Date at UTC midnight for the calendar day.
 */
export function parseAndValidateDateOfBirth(value: string): Date {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new BadRequestException('Date of birth is required.');
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) {
    throw new BadRequestException(
      'dateOfBirth must be a valid ISO 8601 date string (e.g. 1990-06-15)',
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException(
      'dateOfBirth must be a valid ISO 8601 date string (e.g. 1990-06-15)',
    );
  }

  if (year < MIN_BIRTH_YEAR) {
    throw new BadRequestException('Date of birth is too far in the past.');
  }

  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (parsed.getTime() > todayUtc) {
    throw new BadRequestException('Date of birth cannot be in the future.');
  }

  return parsed;
}
