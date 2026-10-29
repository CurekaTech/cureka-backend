import {
  calculateAgeYears,
  formatReviewLocation,
} from './customer-review-profile.util';

describe('calculateAgeYears', () => {
  it('returns completed years before birthday', () => {
    const dob = new Date(Date.UTC(1990, 5, 15));
    const now = new Date(Date.UTC(2026, 5, 14));
    expect(calculateAgeYears(dob, now)).toBe(35);
  });

  it('returns completed years on and after birthday', () => {
    const dob = new Date(Date.UTC(1990, 5, 15));
    const now = new Date(Date.UTC(2026, 5, 15));
    expect(calculateAgeYears(dob, now)).toBe(36);
  });

  it('returns null when DOB is missing', () => {
    expect(calculateAgeYears(null)).toBeNull();
    expect(calculateAgeYears(undefined)).toBeNull();
  });
});

describe('formatReviewLocation', () => {
  it('formats city and state', () => {
    expect(formatReviewLocation({ city: 'Ahmedabad', state: 'Gujarat' })).toBe(
      'Ahmedabad, Gujarat',
    );
  });

  it('trims whitespace and omits empty parts', () => {
    expect(formatReviewLocation({ city: '  Mumbai  ', state: '  ' })).toBe('Mumbai');
    expect(formatReviewLocation({ city: '', state: ' Karnataka ' })).toBe('Karnataka');
  });

  it('returns null when neither city nor state is usable', () => {
    expect(formatReviewLocation({ city: '  ', state: null })).toBeNull();
    expect(formatReviewLocation({})).toBeNull();
  });

  it('never includes street, pincode, or country even if present on the source object', () => {
    const source = {
      city: 'Pune',
      state: 'Maharashtra',
      addressLine1: '12 MG Road',
      pincode: '411001',
      country: 'India',
    };
    expect(formatReviewLocation(source)).toBe('Pune, Maharashtra');
  });
});
