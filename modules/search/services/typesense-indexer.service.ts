import { Injectable, Logger } from '@nestjs/common';
import { BrandsRepository } from '@modules/master/repositories/brands.repository';
import { CategoriesRepository } from '@modules/master/repositories/categories.repository';
import { ProductsRepository } from '@modules/product/repositories/products.repository';
import { mapProductToTypesenseDocument } from '../mappers/typesense-product.mapper';
import { ITypesenseProductDocument } from '../interfaces/typesense-product.interface';
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

    const document = mapProductToTypesenseDocument(product);
    if (!document) {
      await this.removeProduct(refId);
      return;
    }

    await this.upsertDocument(document);
    this.logger.log(`Typesense indexed product refId=${refId}`);
  }

  async removeProduct(refId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    try {
      await client.collections(collectionName).documents(refId).delete();
      this.logger.log(`Typesense removed product refId=${refId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        return;
      }
      throw error;
    }
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

    const brand = await this.brandsRepository.findByRefId(brandRefId);
    if (!brand) {
      return;
    }

    const refIds = await this.productsRepository.findPublishedRefIdsByBrandId(brand.id);
    await this.reindexProducts(refIds);
    this.logger.log(
      `Typesense reindexed ${refIds.length} product(s) for brand refId=${brandRefId}`,
    );
  }

  async reindexByCategoryRefId(categoryRefId: string): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      return;
    }

    const category = await this.categoriesRepository.findByRefId(categoryRefId);
    if (!category) {
      return;
    }

    const refIds = await this.productsRepository.findPublishedRefIdsByCategoryId(category.id);
    await this.reindexProducts(refIds);
    this.logger.log(
      `Typesense reindexed ${refIds.length} product(s) for category refId=${categoryRefId}`,
    );
  }

  async reindexAll(): Promise<{ indexed: number; skipped: number }> {
    if (!this.typesenseClient.isEnabled()) {
      throw new Error('Typesense is not configured');
    }

    await this.collectionService.ensureCollection();

    let page = 1;
    let indexed = 0;
    let skipped = 0;

    while (true) {
      const products = await this.productsRepository.findPublishedProductsForSearch({
        page,
        pageSize: REINDEX_PAGE_SIZE,
      });

      if (!products.length) {
        break;
      }

      const documents = products
        .map((product) => mapProductToTypesenseDocument(product))
        .filter((document): document is NonNullable<typeof document> => document !== null);

      skipped += products.length - documents.length;

      if (documents.length) {
        await this.importDocuments(documents);
        indexed += documents.length;
      }

      if (products.length < REINDEX_PAGE_SIZE) {
        break;
      }

      page += 1;
    }

    this.logger.log(`Typesense full reindex complete: indexed=${indexed}, skipped=${skipped}`);
    return { indexed, skipped };
  }

  private async upsertDocument(document: ITypesenseProductDocument): Promise<void> {
    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    await client.collections(collectionName).documents().upsert(document);
  }

  private async importDocuments(documents: ITypesenseProductDocument[]): Promise<void> {
    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    await client
      .collections(collectionName)
      .documents()
      .import(documents, { action: 'upsert' });
  }
}
