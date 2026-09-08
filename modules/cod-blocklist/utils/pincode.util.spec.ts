import { isValidIndianPincode, normalizePincode } from './pincode.util';

describe('pincode util', () => {
  it('accepts a 6-digit Indian pincode', () => {
    expect(isValidIndianPincode('380015')).toBe(true);
    expect(normalizePincode(' 380015 ')).toBe('380015');
  });

  it('rejects invalid pincodes', () => {
    expect(isValidIndianPincode('38001')).toBe(false);
    expect(isValidIndianPincode('3800151')).toBe(false);
    expect(isValidIndianPincode('38A015')).toBe(false);
  });
});
