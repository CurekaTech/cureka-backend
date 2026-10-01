import {
  isProductVisibleForPincode,
  pincodeAvailabilityPositionalSql,
  pincodeAvailabilitySql,
} from './pincode-availability.util';

describe('isProductVisibleForPincode', () => {
  it('shows an unmanaged product when a pincode is selected', () => {
    expect(isProductVisibleForPincode({ isPincodeManaged: false }, [], '380001')).toBe(true);
  });

  it('shows an unmanaged product when no pincode is selected', () => {
    expect(isProductVisibleForPincode({ isPincodeManaged: false }, [], null)).toBe(true);
  });

  it('hides a managed product when no pincode is selected', () => {
    expect(isProductVisibleForPincode({ isPincodeManaged: true }, ['380001'], null)).toBe(false);
  });

  it('hides a managed product when the selected pincode is not mapped', () => {
    expect(isProductVisibleForPincode({ isPincodeManaged: true }, ['380001'], '560001')).toBe(
      false,
    );
  });

  it('shows a managed product only when the selected pincode is mapped', () => {
    expect(isProductVisibleForPincode({ isPincodeManaged: true }, ['380001'], '380001')).toBe(true);
  });
});

describe('pincodeAvailabilitySql', () => {
  it('restricts to unmanaged products when no pincode is selected', () => {
    const sql = pincodeAvailabilitySql('product', null);
    expect(sql).toContain('product.is_pincode_managed');
    expect(sql).toContain('= false');
    expect(sql).not.toContain('EXISTS');
  });

  it('adds an EXISTS mapping clause for a selected pincode', () => {
    const sql = pincodeAvailabilitySql('p', 'pin-id');
    expect(sql).toContain('COALESCE(p.is_pincode_managed, false) = false');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('product_pincodes');
    expect(sql).toContain('pp_avail.product_id = p.id');
    expect(sql).toContain(':pincodeAvailabilityId');
  });

  it('uses a positional parameter for raw SQL', () => {
    const sql = pincodeAvailabilityPositionalSql('p', 'pin-id', 6);
    expect(sql).toContain('pincode_id = $6::uuid');
    expect(pincodeAvailabilityPositionalSql('p', null, 6)).not.toContain('$6');
  });
});
