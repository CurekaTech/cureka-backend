import { Injectable } from '@nestjs/common';
import { mapProductEntitiesToPublicCards } from '@modules/public/mappers/public-product.mapper';
import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { TypesenseClientService } from './typesense-client.service';

const SEARCH_QUERY_BY =
  'name,brand,category,subCategory,healthConcerns,wellnessGoals,tags,description';

@Injectable()
export class PublicSearchService {
  constructor(
    private readonly typesenseClient: TypesenseClientService,
    private readonly productsRepository: ProductsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async search(query: string, perPage = 10): Promise<IPublicProductCard[]> {
    const trimmed = query.trim();
    if (!trimmed || !this.typesenseClient.isEnabled()) {
      return [];
    }

    const client = this.typesenseClient.getSearchClient();
    const collectionName = this.typesenseClient.getCollectionName();

    const result = await client.collections(collectionName).documents().search({
      q: trimmed,
      query_by: SEARCH_QUERY_BY,
      per_page: perPage,
    });

    const refIds = (result.hits ?? [])
      .map((hit) => String((hit.document as Record<string, unknown>)['id'] ?? ''))
      .filter(Boolean);

    if (!refIds.length) {
      return [];
    }

    const products = await this.productsRepository.findPublishedByRefIds(refIds);
    const cards = mapProductEntitiesToPublicCards(products);
    const enriched = await Promise.all(cards.map((card) => this.enrichCard(card)));

    const cardByRefId = new Map(enriched.map((card) => [card.refId, card]));
    return refIds
      .map((refId) => cardByRefId.get(refId))
      .filter((card): card is IPublicProductCard => Boolean(card));
  }

  private async enrichCard(card: IPublicProductCard): Promise<IPublicProductCard> {
    return {
      ...card,
      primaryImageUrl: await this.storageUrlEnricher.toReference(card.primaryImageUrl),
    };
  }
}
