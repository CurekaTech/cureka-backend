/** Named parameter used by storefront pincode EXISTS clauses. */
export const PINCODE_AVAILABILITY_PARAM = 'pincodeAvailabilityId';

export interface PincodeProductRef {
  isPincodeManaged: boolean;
}

/**
 * Storefront rule mirrored by {@link pincodeAvailabilitySql}.
 * Unmanaged products are available everywhere, including when no pincode is selected.
 * Managed products are available only when the selected pincode is explicitly mapped.
 * Eligibility is the whole product: every active variant is shown, or none are.
 */
export function isProductVisibleForPincode(
  product: PincodeProductRef,
  mappedPincodes: readonly string[],
  selectedPincode: string | null,
): boolean {
  if (!product.isPincodeManaged) {
    return true;
  }
  if (!selectedPincode) {
    return false;
  }
  return mappedPincodes.includes(selectedPincode);
}

/**
 * SQL predicate for a product row alias. `pincodeId` null means the shopper has not
 * selected a pincode, so only unmanaged products match.
 */
export function pincodeAvailabilitySql(
  productAlias: string,
  pincodeId: string | null,
  parameterName = PINCODE_AVAILABILITY_PARAM,
): string {
  const unmanaged = `COALESCE(${productAlias}.is_pincode_managed, false) = false`;
  if (!pincodeId) {
    return unmanaged;
  }
  return `(${unmanaged} OR EXISTS (
    SELECT 1 FROM product_pincodes pp_avail
    WHERE pp_avail.product_id = ${productAlias}.id
      AND pp_avail.pincode_id = :${parameterName}
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
  productAlias: string,
  pincodeId: string | null,
  paramIndex: number,
): string {
  const unmanaged = `COALESCE(${productAlias}.is_pincode_managed, false) = false`;
  if (!pincodeId) {
    return unmanaged;
  }
  return `(${unmanaged} OR EXISTS (
    SELECT 1 FROM product_pincodes pp_avail
    WHERE pp_avail.product_id = ${productAlias}.id
      AND pp_avail.pincode_id = $${paramIndex}::uuid
  ))`;
}
