export type ReplacementSelectionSource = {
  preferredReplacementVariantId?: string | null;
  preferredReplacementSku?: string | null;
  preferredReplacementProductName?: string | null;
  preferredReplacementVariantName?: string | null;
  replacementVariantId?: string | null;
  replacementSku?: string | null;
  replacementProductName?: string | null;
  replacementVariantName?: string | null;
};

export type CustomerReplacementSelection = {
  preferredReplacementVariantId: string | null;
  preferredReplacementSku: string | null;
  preferredReplacementProductName: string | null;
  preferredReplacementVariantName: string | null;
  replacementVariantId: string | null;
  replacementSku: string | null;
  replacementProductName: string | null;
  replacementVariantName: string | null;
};

/**
 * Before admin confirmation the settlement is null, so the confirmed variant
 * is hidden. A legacy row that was confirmed before the preference columns
 * existed has no recoverable preference.
 */
export const customerReplacementSelection = (
  item: ReplacementSelectionSource,
  settlementConfirmed: boolean,
): CustomerReplacementSelection => ({
  preferredReplacementVariantId:
    item.preferredReplacementVariantId ??
    (settlementConfirmed ? null : (item.replacementVariantId ?? null)),
  preferredReplacementSku:
    item.preferredReplacementSku ?? (settlementConfirmed ? null : (item.replacementSku ?? null)),
  preferredReplacementProductName: item.preferredReplacementProductName ?? null,
  preferredReplacementVariantName: item.preferredReplacementVariantName ?? null,
  replacementVariantId: settlementConfirmed ? (item.replacementVariantId ?? null) : null,
  replacementSku: settlementConfirmed ? (item.replacementSku ?? null) : null,
  replacementProductName: settlementConfirmed ? (item.replacementProductName ?? null) : null,
  replacementVariantName: settlementConfirmed ? (item.replacementVariantName ?? null) : null,
});
