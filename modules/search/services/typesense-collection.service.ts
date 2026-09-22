import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  ENTITY_SEARCH_QUERY_FIELDS,
  PRODUCT_COLLECTION_FIELDS,
  PRODUCT_POPULAR_SORT_FIELD,
  PRODUCT_SEARCH_QUERY_FIELDS,
} from '../constants/typesense-product.schema';
import { SEARCH_ENTITY_TYPES } from '../constants/search-entity-type.constant';
import { ITypesenseSearchRuntimeConfig } from '../interfaces/typesense-search-runtime-config.interface';
import { TypesenseClientService } from './typesense-client.service';

function toTypesenseFilterValue(value: string): string {
  return `\`${value.replace(/`/g, '\\`')}\``;
}

function getHttpStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'httpStatus' in error) {
    const status = (error as { httpStatus?: unknown }).httpStatus;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
}

@Injectable()
export class TypesenseCollectionService implements OnModuleInit {
  private readonly logger = new Logger(TypesenseCollectionService.name);
  private fieldNamesCache: Set<string> | null = null;
  private fieldNamesCacheExpiresAt = 0;
  private searchRuntimeConfig: ITypesenseSearchRuntimeConfig | null = null;
  private static readonly FIELD_CACHE_TTL_MS = 60_000;

  constructor(private readonly typesenseClient: TypesenseClientService) {}

  async onModuleInit(): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      this.logger.warn('Typesense is not configured — search indexing is disabled');
      return;
    }

    try {
      await this.ensureCollection();
      await this.warmSearchRuntimeConfig();
    } catch (error) {
      this.logger.error(
        `Failed to ensure Typesense collection: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async ensureCollection(): Promise<void> {
    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();

    let existingFieldNames = new Set<string>();
    let collectionExists = false;

    try {
      const collection = await client.collections(collectionName).retrieve();
      collectionExists = true;
      existingFieldNames = new Set(
        (collection.fields ?? []).map((field) => String(field.name)),
      );
    } catch (error) {
      if (getHttpStatus(error) !== 404) {
        throw error;
      }
    }

    if (!collectionExists) {
      try {
        await client.collections().create({
          name: collectionName,
          fields: [...PRODUCT_COLLECTION_FIELDS],
        });
        this.logger.log(`Typesense collection "${collectionName}" created`);
      } catch (error) {
        if (getHttpStatus(error) === 409) {
          this.logger.log(`Typesense collection "${collectionName}" already exists`);
        } else {
          throw error;
        }
      }

      this.invalidateFieldCache();
      return;
    }

    const missingFields = PRODUCT_COLLECTION_FIELDS.filter(
      (field) => field.name !== 'id' && !existingFieldNames.has(field.name),
    );

    if (!missingFields.length) {
      this.logger.log(`Typesense collection "${collectionName}" schema is up to date`);
      this.invalidateFieldCache();
      return;
    }

    await client.collections(collectionName).update({
      fields: [...missingFields],
    });

    this.logger.log(
      `Typesense collection "${collectionName}" added fields: ${missingFields
        .map((field) => field.name)
        .join(', ')}`,
    );
    this.invalidateFieldCache();
  }

  async getSearchRuntimeConfig(): Promise<ITypesenseSearchRuntimeConfig> {
    if (this.searchRuntimeConfig) {
      return this.searchRuntimeConfig;
    }

    return this.warmSearchRuntimeConfig();
  }

  async warmSearchRuntimeConfig(): Promise<ITypesenseSearchRuntimeConfig> {
    const fieldNames = await this.getCollectionFieldNames();
    const productQueryBy = this.resolveQueryBy(PRODUCT_SEARCH_QUERY_FIELDS, fieldNames);
    const entityQueryBy = this.resolveQueryBy(ENTITY_SEARCH_QUERY_FIELDS, fieldNames);
    const hasEntityType = fieldNames.has('entityType');
    const hasInStock = fieldNames.has('inStock');
    const productEntityFilter = hasEntityType
      ? `entityType:=${toTypesenseFilterValue(SEARCH_ENTITY_TYPES.PRODUCT)}`
      : undefined;
    const productInStockFilter = hasInStock ? 'inStock:true' : undefined;
    const productFilterBy = [productEntityFilter, productInStockFilter].filter(Boolean).join(' && ');

    this.searchRuntimeConfig = {
      hasEntityType,
      hasPopularSortField: fieldNames.has(PRODUCT_POPULAR_SORT_FIELD),
      productQueryBy,
      entityQueryBy,
      entityTypeFilters: hasEntityType
        ? {
            [SEARCH_ENTITY_TYPES.CATEGORY]: `entityType:=${toTypesenseFilterValue(SEARCH_ENTITY_TYPES.CATEGORY)}`,
            [SEARCH_ENTITY_TYPES.BRAND]: `entityType:=${toTypesenseFilterValue(SEARCH_ENTITY_TYPES.BRAND)}`,
            [SEARCH_ENTITY_TYPES.HEALTH_CONCERN]: `entityType:=${toTypesenseFilterValue(SEARCH_ENTITY_TYPES.HEALTH_CONCERN)}`,
            [SEARCH_ENTITY_TYPES.PRODUCT]: productFilterBy || `entityType:=${toTypesenseFilterValue(SEARCH_ENTITY_TYPES.PRODUCT)}`,
          }
        : productInStockFilter
          ? { [SEARCH_ENTITY_TYPES.PRODUCT]: productInStockFilter }
          : {},
    };

    return this.searchRuntimeConfig;
  }

  async getSearchQueryBy(): Promise<string> {
    return (await this.getSearchRuntimeConfig()).productQueryBy;
  }

  async getEntitySearchQueryBy(): Promise<string> {
    return (await this.getSearchRuntimeConfig()).entityQueryBy;
  }

  async hasCollectionField(fieldName: string): Promise<boolean> {
    const fieldNames = await this.getCollectionFieldNames();
    return fieldNames.has(fieldName);
  }

  private resolveQueryBy(
    fields: readonly string[],
    fieldNames: Set<string>,
  ): string {
    const searchable = fields.filter((field) => fieldNames.has(field));
    return searchable.length ? searchable.join(',') : 'name';
  }

  private async getCollectionFieldNames(): Promise<Set<string>> {
    if (this.fieldNamesCache && Date.now() < this.fieldNamesCacheExpiresAt) {
      return this.fieldNamesCache;
    }

    const client = this.typesenseClient.getAdminClient();
    const collectionName = this.typesenseClient.getCollectionName();
    const collection = await client.collections(collectionName).retrieve();
    const fieldNames = new Set(
      (collection.fields ?? []).map((field) => String(field.name)),
    );

    this.fieldNamesCache = fieldNames;
    this.fieldNamesCacheExpiresAt = Date.now() + TypesenseCollectionService.FIELD_CACHE_TTL_MS;
    return fieldNames;
  }

  private invalidateFieldCache(): void {
    this.fieldNamesCache = null;
    this.fieldNamesCacheExpiresAt = 0;
    this.searchRuntimeConfig = null;
  }
}
