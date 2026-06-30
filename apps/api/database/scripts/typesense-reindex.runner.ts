/**
 * Full Typesense reindex for all published products.
 *
 * Usage:
 *   npm run typesense:reindex
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TypesenseIndexerService } from '@modules/search/services/typesense-indexer.service';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const indexer = app.get(TypesenseIndexerService);
    const result = await indexer.reindexAll();
    console.log(
      `[typesense:reindex] complete — indexed=${result.indexed}, skipped=${result.skipped}`,
    );
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error('[typesense:reindex] failed:', error);
  process.exit(1);
});
