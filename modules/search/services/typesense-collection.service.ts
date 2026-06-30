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

    try {
      await client.collections(collectionName).retrieve();
      await client.collections(collectionName).update({
        fields: PRODUCT_COLLECTION_FIELDS.filter((field) => field.name !== 'id'),
      });
      this.logger.log(`Typesense collection "${collectionName}" is ready`);
      return;
    } catch {
      await client.collections().create({
        name: collectionName,
        fields: PRODUCT_COLLECTION_FIELDS,
      });
      this.logger.log(`Typesense collection "${collectionName}" created`);
    }
  }
}
