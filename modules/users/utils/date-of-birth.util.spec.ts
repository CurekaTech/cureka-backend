import { BadRequestException } from '@nestjs/common';
import { parseAndValidateDateOfBirth } from './date-of-birth.util';

describe('parseAndValidateDateOfBirth', () => {
  it('accepts a valid ISO date', () => {
    const result = parseAndValidateDateOfBirth('1990-06-15');
    expect(result.toISOString().startsWith('1990-06-15')).toBe(true);
  });

  it('rejects empty values', () => {
    expect(() => parseAndValidateDateOfBirth('')).toThrow(BadRequestException);
    expect(() => parseAndValidateDateOfBirth('   ')).toThrow(BadRequestException);
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseAndValidateDateOfBirth('2020-02-30')).toThrow(BadRequestException);
  });

  it('rejects future dates', () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);
    const iso = future.toISOString().slice(0, 10);
    expect(() => parseAndValidateDateOfBirth(iso)).toThrow(BadRequestException);
  });

  it('rejects years before 1900', () => {
    expect(() => parseAndValidateDateOfBirth('1899-12-31')).toThrow(BadRequestException);
  });
});
