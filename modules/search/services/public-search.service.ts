import { Injectable } from '@nestjs/common';
import { mapProductEntitiesToPublicCards } from '@modules/public/mappers/public-product.mapper';
import { IPublicProductCard } from '@modules/public/interfaces/public-product.interface';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { StorageUrlEnricher } from '@modules/uploads/services/storage-url.enricher';
import { PRODUCT_POPULAR_SORT_FIELD } from '../constants/typesense-product.schema';
import { TypesenseClientService } from './typesense-client.service';
import { TypesenseCollectionService } from './typesense-collection.service';

@Injectable()
export class PublicSearchService {
  constructor(
    private readonly typesenseClient: TypesenseClientService,
    private readonly collectionService: TypesenseCollectionService,
    private readonly productsRepository: ProductsRepository,
    private readonly storageUrlEnricher: StorageUrlEnricher,
  ) {}

  async search(query: string, perPage = 10): Promise<IPublicProductCard[]> {
    const trimmed = query.trim();
    if (!trimmed || !this.typesenseClient.isEnabled()) {
      return [];
    }

    const collectionName = this.typesenseClient.getCollectionName();
    const queryBy = await this.collectionService.getSearchQueryBy();

    const result = await this.typesenseClient
      .getSearchClient()
      .collections(collectionName)
      .documents()
      .search({
        q: trimmed,
        query_by: queryBy,
        per_page: perPage,
      });

    return this.hydrateSearchHits((result.hits ?? []) as Array<{ document?: Record<string, unknown> }>);
  }

  async getPopular(perPage = 4): Promise<IPublicProductCard[]> {
    if (!this.typesenseClient.isEnabled()) {
      return [];
    }

    const collectionName = this.typesenseClient.getCollectionName();
    const canSortByPrice = await this.collectionService.hasCollectionField(
      PRODUCT_POPULAR_SORT_FIELD,
    );

    const result = await this.typesenseClient
      .getSearchClient()
      .collections(collectionName)
      .documents()
      .search({
        q: '*',
        query_by: 'name',
        per_page: perPage,
        ...(canSortByPrice ? { sort_by: `${PRODUCT_POPULAR_SORT_FIELD}:asc` } : {}),
      });

    return this.hydrateSearchHits((result.hits ?? []) as Array<{ document?: Record<string, unknown> }>);
  }

  private async hydrateSearchHits(
    hits: Array<{ document?: Record<string, unknown> }>,
  ): Promise<IPublicProductCard[]> {
    const refIds = hits
      .map((hit) => String(hit.document?.['id'] ?? ''))
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
