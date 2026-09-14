import { PolicyWindowUnit } from '@modules/product/enums/policy-window-unit.enum';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import {
  IOrderItemReturnPolicySnapshot,
  ReturnPolicySnapshotSource,
} from '../interfaces/order-item-return-policy.interface';

/** Variant columns are nullable so a SKU only overrides what it explicitly sets. */
const pick = <T>(variantValue: T | null | undefined, productValue: T): T =>
  variantValue === null || variantValue === undefined ? productValue : variantValue;

/**
 * Builds the policy snapshot stored on an order item.
 *
 * A variant is returnable only when both the product and the SKU allow it, so a
 * product-level switch-off can never be bypassed by a stale variant flag.
 */
export const buildReturnPolicySnapshot = (
  product: Pick<
    ProductEntity,
    | 'returnAllowed'
    | 'returnPolicy'
    | 'returnWindowDays'
    | 'returnWindowUnit'
    | 'replaceAllowed'
    | 'replaceWindowDays'
    | 'replaceWindowUnit'
    | 'refundAllowed'
    | 'returnPickupRequired'
    | 'returnQcRequired'
    | 'returnEvidenceRequired'
    | 'noPickupRefundAllowed'
  >,
  variant?: Pick<
    ProductVariantEntity,
    | 'returnAllowed'
    | 'returnPolicy'
    | 'returnWindowDays'
    | 'returnWindowUnit'
    | 'replaceAllowed'
    | 'replaceWindowDays'
    | 'replaceWindowUnit'
    | 'refundAllowed'
    | 'returnPickupRequired'
    | 'returnQcRequired'
    | 'returnEvidenceRequired'
    | 'noPickupRefundAllowed'
  > | null,
  source: ReturnPolicySnapshotSource = 'SNAPSHOT',
  capturedAt: Date = new Date(),
): IOrderItemReturnPolicySnapshot => {
  const returnable = Boolean(product.returnAllowed) && variant?.returnAllowed !== false;
  const replaceable = Boolean(product.replaceAllowed) && variant?.replaceAllowed !== false;

  return {
    source,
    capturedAt: capturedAt.toISOString(),
    returnable,
    refundable: returnable && pick(variant?.refundAllowed, product.refundAllowed ?? true),
    replaceable,
    returnWindow: pick(variant?.returnWindowDays, product.returnWindowDays ?? null),
    returnWindowUnit: pick(
      variant?.returnWindowUnit,
      product.returnWindowUnit ?? PolicyWindowUnit.DAYS,
    ),
    replacementWindow: pick(variant?.replaceWindowDays, product.replaceWindowDays ?? null),
    replacementWindowUnit: pick(
      variant?.replaceWindowUnit,
      product.replaceWindowUnit ?? PolicyWindowUnit.DAYS,
    ),
    pickupRequired: pick(variant?.returnPickupRequired, product.returnPickupRequired ?? true),
    qcRequired: pick(variant?.returnQcRequired, product.returnQcRequired ?? true),
    customerEvidenceRequired: pick(
      variant?.returnEvidenceRequired,
      product.returnEvidenceRequired ?? false,
    ),
    noPickupRefundAllowed: pick(
      variant?.noPickupRefundAllowed,
      product.noPickupRefundAllowed ?? false,
    ),
    policyText: pick(variant?.returnPolicy, product.returnPolicy ?? null),
  };
};

/**
 * Snapshot used when an order item predates the snapshot column.
 *
 * Historical items are never assumed returnable: they only become eligible when
 * the live catalogue still allows returns for that product, and the effective
 * window is capped so an unset window cannot mean "forever".
 */
export const LEGACY_FALLBACK_MAX_WINDOW_DAYS = 7;

export const buildLegacyFallbackSnapshot = (
  product: Parameters<typeof buildReturnPolicySnapshot>[0] | null | undefined,
  variant: Parameters<typeof buildReturnPolicySnapshot>[1],
  capturedAt: Date = new Date(),
): IOrderItemReturnPolicySnapshot => {
  if (!product) {
    return {
      source: 'LEGACY_FALLBACK',
      capturedAt: capturedAt.toISOString(),
      returnable: false,
      refundable: false,
      replaceable: false,
      returnWindow: null,
      returnWindowUnit: PolicyWindowUnit.DAYS,
      replacementWindow: null,
      replacementWindowUnit: PolicyWindowUnit.DAYS,
      pickupRequired: true,
      qcRequired: true,
      customerEvidenceRequired: true,
      noPickupRefundAllowed: false,
      policyText: null,
    };
  }

  const snapshot = buildReturnPolicySnapshot(product, variant, 'LEGACY_FALLBACK', capturedAt);
  const cappedWindow = (window: number | null, unit: PolicyWindowUnit): number =>
    unit === PolicyWindowUnit.HOURS
      ? Math.min(window ?? LEGACY_FALLBACK_MAX_WINDOW_DAYS * 24, LEGACY_FALLBACK_MAX_WINDOW_DAYS * 24)
      : Math.min(window ?? LEGACY_FALLBACK_MAX_WINDOW_DAYS, LEGACY_FALLBACK_MAX_WINDOW_DAYS);

  return {
    ...snapshot,
    returnWindow: cappedWindow(snapshot.returnWindow, snapshot.returnWindowUnit),
    replacementWindow: cappedWindow(snapshot.replacementWindow, snapshot.replacementWindowUnit),
    // Legacy orders have no recorded evidence expectations, so always ask for proof.
    customerEvidenceRequired: true,
  };
};
