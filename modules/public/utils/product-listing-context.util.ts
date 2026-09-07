import {
  LockedFacetKey,
  PublicListingContextType,
  PublicProductFacet,
} from '../enums/public-listing-context-type.enum';
import type { PublicFacetOmit } from '@modules/product/repositories/products.repository';

const LOCKED_BY_CONTEXT: Record<PublicListingContextType, LockedFacetKey[]> = {
  [PublicListingContextType.CATEGORY]: ['category'],
  [PublicListingContextType.BRAND]: ['brand'],
  [PublicListingContextType.SEARCH]: ['search'],
  [PublicListingContextType.HEALTH_CONCERN]: ['healthConcern'],
  [PublicListingContextType.WELLNESS_GOAL]: ['wellnessGoal'],
  [PublicListingContextType.TAG]: ['tag'],
  [PublicListingContextType.MIXED]: [],
};

const LOCKED_FACET_KEYS = new Set<LockedFacetKey>([
  'category',
  'brand',
  'search',
  'healthConcern',
  'wellnessGoal',
  'tag',
]);

export interface ListingContextHints {
  categorySlug?: string;
  categoryRefId?: string;
  brandSlug?: string;
  brandRefId?: string;
  search?: string;
  healthConcernSlug?: string;
  healthConcernRefId?: string;
  wellnessGoalRefId?: string;
  tagSlug?: string;
}

export const parseLockedFacets = (raw?: string): LockedFacetKey[] => {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim())
        .filter((part): part is LockedFacetKey => LOCKED_FACET_KEYS.has(part as LockedFacetKey)),
    ),
  ];
};

export const inferListingContextType = (query: ListingContextHints): PublicListingContextType => {
  const present: PublicListingContextType[] = [];
  if (query.categorySlug?.trim() || query.categoryRefId?.trim()) {
    present.push(PublicListingContextType.CATEGORY);
  }
  if (query.brandSlug?.trim() || query.brandRefId?.trim()) {
    present.push(PublicListingContextType.BRAND);
  }
  if (query.search?.trim()) {
    present.push(PublicListingContextType.SEARCH);
  }
  if (query.healthConcernSlug?.trim() || query.healthConcernRefId?.trim()) {
    present.push(PublicListingContextType.HEALTH_CONCERN);
  }
  if (query.wellnessGoalRefId?.trim()) {
    present.push(PublicListingContextType.WELLNESS_GOAL);
  }
  if (query.tagSlug?.trim()) {
    present.push(PublicListingContextType.TAG);
  }
  if (present.length === 1) return present[0];
  return PublicListingContextType.MIXED;
};

export const resolveLockedFacetKeys = (input: {
  contextType?: PublicListingContextType;
  lockedFacets?: string;
  query: ListingContextHints;
}): Set<LockedFacetKey> => {
  const explicit = parseLockedFacets(input.lockedFacets);
  if (explicit.length) {
    return new Set(explicit);
  }

  const contextType = input.contextType ?? inferListingContextType(input.query);
  if (contextType === PublicListingContextType.MIXED) {
    const inferred: LockedFacetKey[] = [];
    if (input.query.categorySlug?.trim() || input.query.categoryRefId?.trim()) inferred.push('category');
    if (input.query.brandRefId?.trim() || (input.query.brandSlug && !input.query.brandSlug.includes(','))) {
      inferred.push('brand');
    }
    if (input.query.search?.trim()) inferred.push('search');
    if (input.query.healthConcernSlug?.trim() || input.query.healthConcernRefId?.trim()) {
      inferred.push('healthConcern');
    }
    if (input.query.wellnessGoalRefId?.trim()) inferred.push('wellnessGoal');
    if (input.query.tagSlug?.trim()) inferred.push('tag');
    return new Set(inferred);
  }

  return new Set(LOCKED_BY_CONTEXT[contextType]);
};

export const resolveFacetOmit = (
  facet: PublicProductFacet | `categoryFilter:${string}`,
  locked: Set<LockedFacetKey>,
): PublicFacetOmit[] => {
  if (facet === PublicProductFacet.BRANDS) {
    return locked.has('brand') ? [] : ['brand'];
  }
  if (facet === PublicProductFacet.CATEGORIES) {
    return locked.has('category') ? [] : ['category'];
  }
  if (facet === PublicProductFacet.PRICE) {
    return ['price'];
  }
  if (typeof facet === 'string' && facet.startsWith('categoryFilter:')) {
    return [facet as PublicFacetOmit];
  }
  return [];
};
