import { IResolvedCategoryFilterCriterion } from './category-filter-query.util';

/** Canonical synthetic option shown in public facet lists. */
export const CATEGORY_FILTER_ALL_VALUE = 'All';

/**
 * True for the synthetic "All" option and legacy master labels like
 * "All Skin Types" / "All Hair Types".
 * Does not match words that merely contain "all" (e.g. "Overall").
 */
export const isCategoryFilterAllSentinel = (value: string): boolean => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  if (normalized === 'all') return true;
  return /^all(\s+.+)?$/.test(normalized);
};

export const hasCategoryFilterAllSentinel = (values: string[]): boolean =>
  values.some((value) => isCategoryFilterAllSentinel(value));

/**
 * Prepend synthetic "All" when the filter has more than one option.
 * Legacy sentinel labels (All Skin Types, …) are removed from the list in favor of "All".
 */
export const ensureCategoryFilterAllOption = (values: string[]): string[] => {
  const trimmed = values.map((value) => String(value ?? '').trim()).filter(Boolean);
  const unique = [...new Set(trimmed)];
  const concrete = unique.filter((value) => !isCategoryFilterAllSentinel(value));

  if (unique.length <= 1) {
    if (concrete.length === 1) return concrete;
    if (unique.length === 1 && isCategoryFilterAllSentinel(unique[0]!)) {
      return [CATEGORY_FILTER_ALL_VALUE];
    }
    return unique;
  }

  return [CATEGORY_FILTER_ALL_VALUE, ...concrete];
};

/**
 * When a criterion includes an All sentinel, expand values to every master option
 * for that filter (so Dry / Oily / Sensitive / All Skin Types all match).
 * If master values are missing, leave the criterion unchanged.
 */
export const expandCategoryFilterAllCriteria = (
  criteria: IResolvedCategoryFilterCriterion[] | undefined,
  masters: Map<string, string[]>,
): IResolvedCategoryFilterCriterion[] | undefined => {
  if (!criteria?.length) return criteria;

  return criteria.map((criterion) => {
    if (!hasCategoryFilterAllSentinel(criterion.values)) {
      return criterion;
    }

    const masterValues = [...new Set((masters.get(criterion.categoryFilterId) ?? [])
      .map((value) => String(value ?? '').trim())
      .filter(Boolean))];

    if (!masterValues.length) {
      return criterion;
    }

    return {
      categoryFilterId: criterion.categoryFilterId,
      values: masterValues,
    };
  });
};
