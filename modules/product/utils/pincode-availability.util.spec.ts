import {
  filterVariantsForPincode,
  isVariantVisibleForPincode,
  pincodeAvailabilityPositionalSql,
  pincodeAvailabilitySql,
} from './pincode-availability.util';

describe('isVariantVisibleForPincode', () => {
  it('A: shows an unmanaged variant when a pincode is selected', () => {
    expect(isVariantVisibleForPincode({ isPincodeManaged: false }, [], '380001')).toBe(true);
  });

  it('B: shows an unmanaged variant when no pincode is selected', () => {
    expect(isVariantVisibleForPincode({ isPincodeManaged: false }, [], null)).toBe(true);
  });

  it('C: hides a managed variant when no pincode is selected', () => {
    expect(isVariantVisibleForPincode({ isPincodeManaged: true }, ['380001'], null)).toBe(false);
  });

  it('D: hides a managed variant when the selected pincode is not mapped', () => {
    expect(isVariantVisibleForPincode({ isPincodeManaged: true }, ['380001'], '560001')).toBe(
      false,
    );
  });

  it('E: shows a managed variant only when the selected pincode is mapped', () => {
    expect(isVariantVisibleForPincode({ isPincodeManaged: true }, ['380001'], '380001')).toBe(true);
  });

  it('G: keeps only eligible variants on a mixed product', () => {
    const variants = [
      { id: 'all-india', isPincodeManaged: false, mappedPincodes: [] },
      { id: 'ahmedabad', isPincodeManaged: true, mappedPincodes: ['380001'] },
      { id: 'empty', isPincodeManaged: true, mappedPincodes: [] },
    ];

    expect(filterVariantsForPincode(variants, null).map((variant) => variant.id)).toEqual([
      'all-india',
    ]);
    expect(filterVariantsForPincode(variants, '380001').map((variant) => variant.id)).toEqual([
      'all-india',
      'ahmedabad',
    ]);
  });
});

describe('pincodeAvailabilitySql', () => {
  it('restricts to unmanaged variants when no pincode is selected', () => {
    const sql = pincodeAvailabilitySql('variant', null);
    expect(sql).toContain('variant.is_pincode_managed');
    expect(sql).toContain('= false');
    expect(sql).not.toContain('EXISTS');
  });

  it('adds an EXISTS mapping clause for a selected pincode', () => {
    const sql = pincodeAvailabilitySql('pv', 'pin-id');
    expect(sql).toContain('COALESCE(pv.is_pincode_managed, false) = false');
    expect(sql).toContain('EXISTS');
    expect(sql).toContain('product_variant_pincodes');
    expect(sql).toContain(':pincodeAvailabilityId');
  });

  it('uses a positional parameter for raw SQL', () => {
    const sql = pincodeAvailabilityPositionalSql('pv_ins', 'pin-id', 6);
    expect(sql).toContain('pincode_id = $6::uuid');
    expect(pincodeAvailabilityPositionalSql('pv_ins', null, 6)).not.toContain('$6');
  });
});
