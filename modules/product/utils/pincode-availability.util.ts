/** Named parameter used by storefront pincode EXISTS clauses. */
export const PINCODE_AVAILABILITY_PARAM = 'pincodeAvailabilityId';

export interface PincodeVariantRef {
  isPincodeManaged: boolean;
}

/**
 * Storefront rule mirrored by {@link pincodeAvailabilitySql}.
 * Unmanaged variants are available everywhere, including when no pincode is selected.
 * Managed variants are available only when the selected pincode is explicitly mapped.
 */
export function isVariantVisibleForPincode(
  variant: PincodeVariantRef,
  mappedPincodes: readonly string[],
  selectedPincode: string | null,
): boolean {
  if (!variant.isPincodeManaged) {
    return true;
  }
  if (!selectedPincode) {
    return false;
  }
  return mappedPincodes.includes(selectedPincode);
}

export function filterVariantsForPincode<T extends PincodeVariantRef & { mappedPincodes?: readonly string[] }>(
  variants: readonly T[],
  selectedPincode: string | null,
): T[] {
  return variants.filter((variant) =>
    isVariantVisibleForPincode(variant, variant.mappedPincodes ?? [], selectedPincode),
  );
}

/**
 * SQL predicate for a variant row alias. `pincodeId` null means the shopper has not
 * selected a pincode, so only unmanaged variants match.
 */
export function pincodeAvailabilitySql(
  variantAlias: string,
  pincodeId: string | null,
  parameterName = PINCODE_AVAILABILITY_PARAM,
): string {
  const unmanaged = `COALESCE(${variantAlias}.is_pincode_managed, false) = false`;
  if (!pincodeId) {
    return unmanaged;
  }
  return `(${unmanaged} OR EXISTS (
    SELECT 1 FROM product_variant_pincodes pvp_avail
    WHERE pvp_avail.product_variant_id = ${variantAlias}.id
      AND pvp_avail.pincode_id = :${parameterName}
  ))`;
}

export function bindPincodeAvailability(
  qb: { setParameter: (key: string, value: unknown) => unknown },
  pincodeId: string | null | undefined,
  parameterName = PINCODE_AVAILABILITY_PARAM,
): void {
  if (pincodeId) {
    qb.setParameter(parameterName, pincodeId);
  }
}

/** Positional form for raw `manager.query` statements. */
export function pincodeAvailabilityPositionalSql(
  variantAlias: string,
  pincodeId: string | null,
  paramIndex: number,
): string {
  const unmanaged = `COALESCE(${variantAlias}.is_pincode_managed, false) = false`;
  if (!pincodeId) {
    return unmanaged;
  }
  return `(${unmanaged} OR EXISTS (
    SELECT 1 FROM product_variant_pincodes pvp_avail
    WHERE pvp_avail.product_variant_id = ${variantAlias}.id
      AND pvp_avail.pincode_id = $${paramIndex}::uuid
  ))`;
}
