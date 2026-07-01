import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  PRODUCT_COLLECTION_FIELDS,
  PRODUCT_POPULAR_SORT_FIELD,
  PRODUCT_SEARCH_QUERY_FIELDS,
} from '../constants/typesense-product.schema';
import { TypesenseClientService } from './typesense-client.service';

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
  private static readonly FIELD_CACHE_TTL_MS = 60_000;

  constructor(private readonly typesenseClient: TypesenseClientService) {}

  async onModuleInit(): Promise<void> {
    if (!this.typesenseClient.isEnabled()) {
      this.logger.warn('Typesense is not configured — search indexing is disabled');
      return;
    }

    try {
      await this.ensureCollection();
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

  async getSearchQueryBy(): Promise<string> {
    const fieldNames = await this.getCollectionFieldNames();
    const searchable = PRODUCT_SEARCH_QUERY_FIELDS.filter((field) => fieldNames.has(field));
    return searchable.length ? searchable.join(',') : 'name';
  }

  async hasCollectionField(fieldName: string): Promise<boolean> {
    const fieldNames = await this.getCollectionFieldNames();
    return fieldNames.has(fieldName);
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
  }
}
