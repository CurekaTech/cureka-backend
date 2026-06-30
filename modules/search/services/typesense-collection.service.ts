import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TypesenseClientService } from './typesense-client.service';

const PRODUCT_COLLECTION_FIELDS = [
  { name: 'id', type: 'string' as const },
  { name: 'name', type: 'string' as const },
  { name: 'slug', type: 'string' as const },
  { name: 'brand', type: 'string' as const, optional: true },
  { name: 'category', type: 'string' as const, optional: true },
  { name: 'subCategory', type: 'string' as const, optional: true },
  { name: 'healthConcerns', type: 'string' as const, optional: true },
  { name: 'wellnessGoals', type: 'string' as const, optional: true },
  { name: 'tags', type: 'string' as const, optional: true },
  { name: 'description', type: 'string' as const, optional: true },
  { name: 'inStock', type: 'bool' as const, optional: true },
  { name: 'minSellingPrice', type: 'float' as const, optional: true },
];

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

    let collectionExists = false;
    try {
      await client.collections(collectionName).retrieve();
      collectionExists = true;
    } catch (error) {
      if (getHttpStatus(error) !== 404) {
        throw error;
      }
    }

    if (collectionExists) {
      try {
        await client.collections(collectionName).update({
          fields: PRODUCT_COLLECTION_FIELDS.filter((field) => field.name !== 'id'),
        });
        this.logger.log(`Typesense collection "${collectionName}" schema updated`);
      } catch (error) {
        this.logger.warn(
          `Typesense collection "${collectionName}" exists; schema patch skipped: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return;
    }

    try {
      await client.collections().create({
        name: collectionName,
        fields: PRODUCT_COLLECTION_FIELDS,
      });
      this.logger.log(`Typesense collection "${collectionName}" created`);
    } catch (error) {
      if (getHttpStatus(error) === 409) {
        this.logger.log(`Typesense collection "${collectionName}" already exists`);
        return;
      }
      throw error;
    }
  }
}
