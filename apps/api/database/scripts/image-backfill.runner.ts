/**
 * Resumable image-derivative backfill / retry.
 *
 * Dry-run (default):
 *   npm run image:backfill
 *
 * Apply (staging/prod only after worker is running):
 *   npm run image:backfill -- --apply --priority=homepage --batch-size=25
 *
 * Resume:
 *   npm run image:backfill -- --apply --resume
 *
 * Retry failed/stuck:
 *   npm run image:retry -- --apply --limit=50
 *
 * Do not run a production backfill from this implementation session.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ImageWorkerModule } from '../../image-worker.module';
import { ImageBackfillService } from '@modules/image-pipeline/services/image-backfill.service';
import { ImagePipelineService } from '@modules/image-pipeline/services/image-pipeline.service';
import {
  ALL_IMAGE_BACKFILL_ENTITY_TYPES,
  ImageBackfillEntityType,
} from '@modules/image-pipeline/enums/image-backfill-entity.enum';

type CliOptions = {
  apply: boolean;
  resume: boolean;
  retryFailed: boolean;
  help: boolean;
  priorityHomepage: boolean;
  keys?: string[];
  entityTypes?: ImageBackfillEntityType[];
  sampleLimit?: number;
  batchSize?: number;
  rateLimitMs?: number;
  limit?: number;
};

const printUsage = (): void => {
  console.log(`
image:backfill — queue existing stored images for WebP derivative generation

  Dry-run:  npm run image:backfill
  Apply:    npm run image:backfill -- --apply
  Resume:   npm run image:backfill -- --apply --resume
  Retry:    npm run image:retry -- --apply --limit=50

Options:
  --apply                 Enqueue work (default: dry-run)
  --resume                Continue from image_pipeline_checkpoints
  --retry-failed          Re-queue failed/pending/processing rows via backfill scan
  --keys=a,b              Queue specific object keys (no table scan)
  --priority=homepage     Banners, home-sections, products, brands, categories, health-concerns first (default)
  --priority=all          All entity types in default order
  --entity-types=a,b      Restrict to types: ${ALL_IMAGE_BACKFILL_ENTITY_TYPES.join(', ')}
  --sample-limit=N        Stop after N scanned rows
  --batch-size=N          Keyset page size (default from IMAGE_BACKFILL_BATCH_SIZE)
  --rate-limit-ms=N       Delay between enqueue calls
  --limit=N               Retry command max rows
`);
};

const parseCsvTypes = (value: string): ImageBackfillEntityType[] => {
  const allowed = new Set<string>(ALL_IMAGE_BACKFILL_ENTITY_TYPES);
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = parsed.filter((item) => !allowed.has(item));
  if (invalid.length) {
    throw new Error(`Unknown entity types: ${invalid.join(', ')}`);
  }
  return parsed as ImageBackfillEntityType[];
};

const parseCli = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    apply: false,
    resume: false,
    retryFailed: false,
    help: false,
    priorityHomepage: true,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--resume') options.resume = true;
    else if (arg === '--retry-failed') options.retryFailed = true;
    else if (arg === '--priority=all') options.priorityHomepage = false;
    else if (arg === '--priority=homepage') options.priorityHomepage = true;
    else if (arg.startsWith('--entity-types=')) {
      options.entityTypes = parseCsvTypes(arg.slice('--entity-types='.length));
    } else if (arg.startsWith('--keys=')) {
      options.keys = arg
        .slice('--keys='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    } else if (arg.startsWith('--sample-limit=')) {
      options.sampleLimit = Number(arg.slice('--sample-limit='.length));
    } else if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number(arg.slice('--batch-size='.length));
    } else if (arg.startsWith('--rate-limit-ms=')) {
      options.rateLimitMs = Number(arg.slice('--rate-limit-ms='.length));
    } else if (arg.startsWith('--limit=')) {
      options.limit = Number(arg.slice('--limit='.length));
    }
  }

  return options;
};

async function run(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const retryOnly =
    process.argv.includes('--retry-only') || process.env['IMAGE_RETRY_ONLY'] === 'true';
  if (options.help) {
    printUsage();
    return;
  }

  const processingEnabled =
    (process.env['IMAGE_PROCESSING_ENABLED'] ?? 'false').toLowerCase() === 'true';
  if (options.apply && !processingEnabled) {
    throw new Error(
      'IMAGE_PROCESSING_ENABLED must be true to enqueue work. Dry-run is still allowed.\n' +
        'Prefix the command (do not put this on the API PM2 process):\n' +
        '  IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --sample-limit=5 --entity-types=banners',
    );
  }

  // Slim module: no homepage/Typesense/BOB processors. Never enable encoding in this CLI.
  process.env['IMAGE_WORKER_ENABLED'] = 'false';

  const app = await NestFactory.createApplicationContext(ImageWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const pipeline = app.get(ImagePipelineService);

    if (retryOnly) {
      if (!options.apply) {
        console.log('[image:retry] dry-run; pass --apply to re-queue failed rows');
        return;
      }
      const queued = await pipeline.retryFailed(options.limit ?? 50);
      console.log(`[image:retry] queued=${queued}`);
      return;
    }

    const backfill = app.get(ImageBackfillService);

    if (options.keys?.length) {
      const stats = await backfill.enqueueKeys(options.keys, options.apply, options.retryFailed);
      console.log('[image:backfill] complete (explicit keys)');
      console.log(JSON.stringify({ apply: options.apply, keys: options.keys, ...stats }, null, 2));
      return;
    }

    const entityTypes = options.entityTypes?.length
      ? options.entityTypes
      : backfill.defaultEntityTypes(options.priorityHomepage);

    const stats = await backfill.run({
      apply: options.apply,
      resume: options.resume,
      retryFailed: options.retryFailed,
      entityTypes,
      sampleLimit:
        options.sampleLimit && Number.isFinite(options.sampleLimit)
          ? Math.trunc(options.sampleLimit)
          : undefined,
      batchSize:
        options.batchSize && Number.isFinite(options.batchSize) && options.batchSize > 0
          ? Math.trunc(options.batchSize)
          : 50,
      rateLimitMs:
        options.rateLimitMs && Number.isFinite(options.rateLimitMs) && options.rateLimitMs >= 0
          ? Math.trunc(options.rateLimitMs)
          : 100,
      checkpointId: 'image-backfill:default',
    });

    console.log('[image:backfill] complete');
    console.log(JSON.stringify({ apply: options.apply, entityTypes, ...stats }, null, 2));
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[image:backfill] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
