import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { mapProductEntitiesToPublicCards } from '@modules/public/mappers/public-product.mapper';
import { ProductEntity } from '@modules/product/entities/product.entity';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';

export function mapPublishedProductsToWishlistCards(
  products: ProductEntity[],
): IPublicProductCard[] {
  return mapProductEntitiesToPublicCards(products);
}

export async function enrichWishlistCards(
  cards: IPublicProductCard[],
  storageUrlEnricher: StorageUrlEnricher,
): Promise<IPublicProductCard[]> {
  if (!cards.length) {
    return cards;
  }

  return storageUrlEnricher.enrichReferences(
    cards,
    (card) => card.primaryImageUrl,
    (card, primaryImageUrl) => ({ ...card, primaryImageUrl }),
  );
}

export function orderWishlistCardsByProductIds(
  productIds: string[],
  cards: IPublicProductCard[],
): IPublicProductCard[] {
  const cardByProductId = new Map(cards.map((card) => [card.id, card]));
  return productIds
    .map((productId) => cardByProductId.get(productId))
    .filter((card): card is IPublicProductCard => Boolean(card));
}
