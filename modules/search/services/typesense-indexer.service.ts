import { Injectable, Logger } from '@nestjs/common';
import { HealthConcernsRepository } from '@modules/master/repositories/health-concerns.repository';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import {
  buildBrandDocumentId,
  buildCategoryDocumentId,
  buildHealthConcernDocumentId,
  buildProductDocumentId,
} from '../constants/typesense-document-id.constant';
import { ITypesenseSearchDocument } from '../interfaces/typesense-search-document.interface';
import { mapProductToTypesenseDocuments, getProductTypesenseDocumentIds } from '../mappers/typesense-product.mapper';
import {
  mapBrandToTypesenseDocument,
  mapCategoryToTypesenseDocument,
  mapHealthConcernToTypesenseDocument,
} from '../mappers/typesense-search-entity.mapper';
import { TypesenseClientService } from './typesense-client.service';
import { TypesenseCollectionService } from './typesense-collection.service';

const REINDEX_PAGE_SIZE = 100;

@Injectable()
export class TypesenseIndexerService {
  private readonly logger = new Logger(TypesenseIndexerService.name);

  constructor(
    private readonly typesenseClient: TypesenseClientService,
    private readonly collectionService: TypesenseCollectionService,
    private readonly productsRepository: ProductsRepository,
    private readonly brandsRepository: BrandsRepository,
    private readonly categoriesRepository: CategoriesRepository,
    private readonly healthConcernsRepository: HealthConcernsRepository,
  ) {}

  async syncProduct(refId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const product = await this.productsRepository.findByRefId(refId);
    if (!product) {
      await this.removeProduct(refId);
      return;
    }

    const documents = mapProductToTypesenseDocuments(product);
    if (!documents.length) {
      await this.removeProduct(refId);
      return;
    }

    await this.syncProductDocuments(product, documents);
    this.logger.log(`Typesense indexed product refId=${refId} (${documents.length} variant doc(s))`);
  }

  private async syncProductDocuments(
    product: NonNullable<Awaited<ReturnType<ProductsRepository['findByRefId']>>>,
    documents: ITypesenseSearchDocument[],
  ): Promise<void> {
    const desiredIds = new Set(documents.map((document) => document.id));
    const staleIds = getProductTypesenseDocumentIds(product).filter((id) => !desiredIds.has(id));

    for (const documentId of staleIds) {
      await this.removeDocument(documentId, 'product variant');
    }

    await this.importDocuments(documents);
  }

  async syncCategory(refId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const category = await this.categoriesRepository.findByRefId(refId);
    if (!category) {
      await this.removeCategory(refId);
      return;
    }

    const slugPath = await this.categoriesRepository.findSlugPathById(category.id);
    const document = mapCategoryToTypesenseDocument(category, slugPath);
    if (!document) {
      await this.removeCategory(refId);
      return;
    }

    await this.upsertDocument(document);
    this.logger.log(`Typesense indexed category refId=${refId}`);
  }

  async syncBrand(refId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const brand = await this.brandsRepository.findByRefId(refId);
    if (!brand) {
      await this.removeBrand(refId);
      return;
    }

    const document = mapBrandToTypesenseDocument(brand);
    if (!document) {
      await this.removeBrand(refId);
      return;
    }

    await this.upsertDocument(document);
    this.logger.log(`Typesense indexed brand refId=${refId}`);
  }

  async syncHealthConcern(refId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const healthConcern = await this.healthConcernsRepository.findByRefId(refId);
    if (!healthConcern) {
      await this.removeHealthConcern(refId);
      return;
    }

    const document = mapHealthConcernToTypesenseDocument(healthConcern);
    if (!document) {
      await this.removeHealthConcern(refId);
      return;
    }

    await this.upsertDocument(document);
    this.logger.log(`Typesense indexed health concern refId=${refId}`);
  }

  async removeProduct(refId: string): Promise<void> {
    const product = await this.productsRepository.findByRefId(refId);
    const documentIds = product
      ? getProductTypesenseDocumentIds(product)
      : [buildProductDocumentId(refId)];

    for (const documentId of documentIds) {
      await this.removeDocument(documentId, 'product');
    }
  }

  async removeCategory(refId: string): Promise<void> {
    await this.removeDocument(buildCategoryDocumentId(refId), 'category');
  }

  async removeBrand(refId: string): Promise<void> {
    await this.removeDocument(buildBrandDocumentId(refId), 'brand');
  }

  async removeHealthConcern(refId: string): Promise<void> {
    await this.removeDocument(buildHealthConcernDocumentId(refId), 'health concern');
  }

  async reindexProducts(refIds: string[]): Promise<void> {
    if (!this.typesenseClient.isEnabled() || !refIds.length) {
      return;
    }

    const uniqueRefIds = [...new Set(refIds)];
    for (const refId of uniqueRefIds) {
      await this.syncProduct(refId);
    }
  }

  async reindexByBrandRefId(brandRefId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    await this.syncBrand(brandRefId);

    const brand = await this.brandsRepository.findByRefId(brandRefId);
    if (!brand) {
      return;
    }

    const refIds = await this.productsRepository.findPublishedRefIdsByBrandId(brand.id);
    await this.reindexProducts(refIds);
    this.logger.log(
      `Typesense reindexed brand refId=${brandRefId} and ${refIds.length} product(s)`,
    );
  }

  async reindexByCategoryRefId(categoryRefId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    await this.syncCategory(categoryRefId);

    const category = await this.categoriesRepository.findByRefId(categoryRefId);
    if (!category) {
      return;
    }

    const refIds = await this.productsRepository.findPublishedRefIdsByCategoryId(category.id);
    await this.reindexProducts(refIds);
    this.logger.log(
      `Typesense reindexed category refId=${categoryRefId} and ${refIds.length} product(s)`,
    );
  }

  async reindexAll(): Promise<{
    indexed: number;
    skipped: number;
    categories: number;
    brands: number;
    healthConcerns: number;
  }> {
    if (!this.typesenseClient.isEnabled()) {
      throw new Error('Typesense is not configured');
    }

    await this.collectionService.ensureCollection();

    let page = 1;
    let indexed = 0;
    let skipped = 0;

    this.logger.log(
      { pageSize: REINDEX_PAGE_SIZE },
      'Typesense full reindex started — indexing published products (this can take several minutes)',
    );

    while (true) {
      const pageStartedAt = Date.now();
      const products = await this.productsRepository.findPublishedProductsForSearch({
        page,
        pageSize: REINDEX_PAGE_SIZE,
      });

      if (!products.length) {
        break;
      }

      let pageIndexed = 0;
      let pageSkipped = 0;
      for (const product of products) {
        const productDocuments = mapProductToTypesenseDocuments(product);
        if (!productDocuments.length) {
          skipped += 1;
          pageSkipped += 1;
          continue;
        }

        await this.syncProductDocuments(product, productDocuments);
        indexed += productDocuments.length;
        pageIndexed += productDocuments.length;
      }

      this.logger.log(
        {
          page,
          productsInPage: products.length,
          pageVariantDocs: pageIndexed,
          pageSkipped,
          totalVariantDocs: indexed,
          totalSkippedProducts: skipped,
          pageDurationMs: Date.now() - pageStartedAt,
        },
        'Typesense reindex product page complete',
      );

      if (products.length < REINDEX_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    this.logger.log('Typesense reindex — indexing categories, brands, health concerns');
    const categories = await this.indexActiveCategories();
    const brands = await this.indexActiveBrands();
    const healthConcerns = await this.indexActiveHealthConcerns();

    this.logger.log(
      `Typesense full reindex complete: products indexed=${indexed}, skipped=${skipped}, categories=${categories}, brands=${brands}, healthConcerns=${healthConcerns}`,
    );

    return { indexed, skipped, categories, brands, healthConcerns };
  }

  private async indexActiveCategories(): Promise<number> {
    const categories = await this.categoriesRepository.findActiveCategories();
    const documents: ITypesenseSearchDocument[] = [];

    for (const category of categories) {
      const slugPath = await this.categoriesRepository.findSlugPathById(category.id);
      const document = mapCategoryToTypesenseDocument(category, slugPath);
      if (document) {
        documents.push(document);
      }
    }

    if (documents.length) {
      await this.importDocuments(documents);
    }

    return documents.length;
  }

  private async indexActiveBrands(): Promise<number> {
    const brands = await this.brandsRepository.findAllActive();
    const documents = brands
      .map((brand) => mapBrandToTypesenseDocument(brand))
      .filter((document): document is ITypesenseSearchDocument => document !== null);

    if (documents.length) {
      await this.importDocuments(documents);
    }

    return documents.length;
  }

  private async indexActiveHealthConcerns(): Promise<number> {
    const healthConcerns = await this.healthConcernsRepository.findAllActive();
    const documents = healthConcerns
      .map((concern) => mapHealthConcernToTypesenseDocument(concern))
      .filter((document): document is ITypesenseSearchDocument => document !== null);

    if (documents.length) {
      await this.importDocuments(documents);
    }

    return documents.length;
  }

  private async removeDocument(documentId: string, label: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    try {
      await client.collections(collectionName).documents(documentId).delete();
      this.logger.log(`Typesense removed ${label} documentId=${documentId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        return;
      }
      throw error;
    }
  }

  private async upsertDocument(document: ITypesenseSearchDocument): Promise<void> {
    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    await client.collections(collectionName).documents().upsert(document);
  }

  private async importDocuments(documents: ITypesenseSearchDocument[]): Promise<void> {
    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    await client
      .collections(collectionName)
      .documents()
      .import(documents, { action: 'upsert' });
  }
}
