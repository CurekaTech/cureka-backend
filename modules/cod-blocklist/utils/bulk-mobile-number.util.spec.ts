import {
  validateStrictBulkIndianMobile,
} from './bulk-mobile-number.util';

describe('validateStrictBulkIndianMobile', () => {
  it('accepts exactly 10 digits starting with 6–9', () => {
    expect(validateStrictBulkIndianMobile('8238061585')).toEqual({
      ok: true,
      mobileNumber: '8238061585',
    });
    expect(validateStrictBulkIndianMobile('9876543210').ok).toBe(true);
    expect(validateStrictBulkIndianMobile('6123456789').ok).toBe(true);
  });

  it('trims leading and trailing spaces then accepts', () => {
    expect(validateStrictBulkIndianMobile(' 8238061585 ')).toEqual({
      ok: true,
      mobileNumber: '8238061585',
    });
  });

  it('rejects fewer or more than 10 digits', () => {
    expect(validateStrictBulkIndianMobile('823806158').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('98238061585').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('918238061585').ok).toBe(false);
  });

  it('rejects 91 and 0 prefixes', () => {
    const with91 = validateStrictBulkIndianMobile('918238061585');
    expect(with91.ok).toBe(false);
    if (!with91.ok) expect(with91.reason).toMatch(/91/i);

    const with0 = validateStrictBulkIndianMobile('08238061585');
    expect(with0.ok).toBe(false);
    if (!with0.ok) expect(with0.reason).toMatch(/leading 0/i);
  });

  it('rejects decimals, scientific notation, letters, special chars, and spaces', () => {
    expect(validateStrictBulkIndianMobile('8238061585.0').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('8.24E+09').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('82380ABC85').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('82380-61585').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('82380 61585').ok).toBe(false);
  });

  it('rejects empty, blank, and NULL', () => {
    expect(validateStrictBulkIndianMobile('').ok).toBe(false);
    expect(validateStrictBulkIndianMobile('   ').ok).toBe(false);
    expect(validateStrictBulkIndianMobile(null).ok).toBe(false);
    expect(validateStrictBulkIndianMobile('NULL').ok).toBe(false);
  });

  it('rejects numbers beginning with 1–5', () => {
    const result = validateStrictBulkIndianMobile('5238061585');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/start with 6/i);
  });
});
