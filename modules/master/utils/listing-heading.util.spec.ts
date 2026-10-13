import { normalizeListingHeading } from './listing-heading.util';

describe('normalizeListingHeading', () => {
  it('keeps HTML and clears an empty heading', () => {
    expect(normalizeListingHeading('<u>Hair Fall</u>')).toBe('<u>Hair Fall</u>');
    expect(normalizeListingHeading('')).toBeNull();
    expect(normalizeListingHeading('   ')).toBeNull();
    expect(normalizeListingHeading(null)).toBeNull();
    expect(normalizeListingHeading(undefined)).toBeNull();
  });
});
