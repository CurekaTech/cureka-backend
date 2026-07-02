import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { IPublicSearchResult } from '../interfaces/public-search-result.interface';

export function mapProductCardToSearchResult(card: IPublicProductCard): IPublicSearchResult {
  return {
    entityType: SEARCH_ENTITY_TYPES.PRODUCT,
    title: card.name,
    slug: card.slug,
    refId: card.refId,
    product: card,
  };
}

export function mapProductCardsToSearchResults(cards: IPublicProductCard[]): IPublicSearchResult[] {
  return cards.map(mapProductCardToSearchResult);
}
