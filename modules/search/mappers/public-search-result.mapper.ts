import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { BrandEntity } from '@modules/master/entities/brand.entity';
import { CategoryEntity } from '@modules/master/entities/category.entity';
import { HealthConcernEntity } from '@modules/master/entities/health-concern.entity';
import { ProductVariantEntity } from '@modules/product/entities/product-variant.entity';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';

export function mapProductCardToSearchResult(card: IPublicProductCard): IPublicSearchResult {
  return {
    entityType: SEARCH_ENTITY_TYPES.PRODUCT,
    title: card.name,
    slug: card.slug,
    refId: card.refId,
    productPageUrl: card.productPageUrl ?? null,
    permalink: card.permalink,
    product: {
      permalink: card.permalink,
      categorySlugPath: card.categorySlugPath,
    },
  };
}

export function mapProductCardsToSearchResults(cards: IPublicProductCard[]): IPublicSearchResult[] {
  return cards.map(mapProductCardToSearchResult);
}

export function mapVariantToSearchResult(variant: ProductVariantEntity): IPublicSearchResult | null {
  const product = variant.product;
  const title = variant.displayName?.trim() || product?.name?.trim() || '';
  const slug = variant.slug?.trim() || product?.slug?.trim() || '';
  const refId = product?.refId?.trim() || '';
  if (!title || !slug || !refId) {
    return null;
  }

  return {
    entityType: SEARCH_ENTITY_TYPES.PRODUCT,
    title,
    slug,
    refId,
    productPageUrl: variant.productPageUrl ?? null,
  };
}

export function mapBrandToSearchResult(brand: BrandEntity): IPublicSearchResult {
  return {
    entityType: SEARCH_ENTITY_TYPES.BRAND,
    title: brand.name,
    slug: brand.slug,
    refId: brand.refId,
  };
}

export function mapCategoryToSearchResult(
  category: CategoryEntity,
  permalink?: string | null,
): IPublicSearchResult {
  return {
    entityType: SEARCH_ENTITY_TYPES.CATEGORY,
    title: category.name,
    slug: category.slug,
    refId: category.refId,
    ...(permalink ? { permalink } : {}),
  };
}

export function mapHealthConcernToSearchResult(
  healthConcern: HealthConcernEntity,
): IPublicSearchResult {
  return {
    entityType: SEARCH_ENTITY_TYPES.HEALTH_CONCERN,
    title: healthConcern.name,
    slug: healthConcern.slug,
    refId: healthConcern.refId,
  };
}
