/**
 * Full sitemap generation for all groups.
 *
 * Usage:
 *   npm run sitemap:generate
 *   npm run sitemap:generate -- --group=products
 *
 * IMPORTANT: This writes to STORAGE_DRIVER / GCS_BUCKET_NAME from the .env of
 * the machine you run it on. Do not run against the prod bucket with a
 * staging STOREFRONT_URL / missing SITEMAP_BASE_URL.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../app.module';
import { SitemapGeneratorService } from '@modules/sitemap/services/sitemap-generator.service';
import { isSitemapGroup } from '@modules/sitemap/config/sitemap-groups';

async function run(): Promise<void> {
  const groupArg = process.argv.find((arg) => arg.startsWith('--group='))?.slice('--group='.length);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const config = app.get(ConfigService);
    const baseUrl = (config.get<string>('sitemap.baseUrl') ?? '').replace(/\/+$/, '');
    const storageDriver = config.get<string>('storage.driver') ?? process.env['STORAGE_DRIVER'] ?? 'local';
    const bucket =
      config.get<string>('storage.gcs.bucket') ?? process.env['GCS_BUCKET_NAME'] ?? '(none)';

    console.log('[sitemap:generate] resolved config:');
    console.log(`  baseUrl (used in <loc>):     ${baseUrl || '(MISSING)'}`);
    console.log(`  SITEMAP_BASE_URL (env):      ${process.env['SITEMAP_BASE_URL'] ?? '(unset)'}`);
    console.log(`  STOREFRONT_URL (env):        ${process.env['STOREFRONT_URL'] ?? '(unset)'}`);
    console.log(`  STORAGE_DRIVER:              ${storageDriver}`);
    console.log(`  GCS_BUCKET_NAME:             ${bucket}`);
    console.log(`  cwd:                         ${process.cwd()}`);

    if (!baseUrl) {
      throw new Error('SITEMAP_BASE_URL or STOREFRONT_URL must be set');
    }

    if (/techbv|localhost|example\.com/i.test(baseUrl) && storageDriver === 'gcs') {
      console.warn(
        `[sitemap:generate] WARNING: baseUrl looks non-production (${baseUrl}) but STORAGE_DRIVER=gcs — this will overwrite bucket XML with that host.`,
      );
    }

    const generator = app.get(SitemapGeneratorService);
    const result = groupArg
      ? isSitemapGroup(groupArg)
        ? await generator.generateGroup(groupArg)
        : (() => {
            throw new Error(`Unknown sitemap group "${groupArg}"`);
          })()
      : await generator.generateAll();

    console.log(
      `[sitemap:generate] complete — baseUrl=${baseUrl} groups=${result.groups.join(',')} urls=${result.urlCount} files=${result.fileCount} durationMs=${result.durationMs}`,
    );
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[sitemap:generate] failed:', error);
    process.exit(1);
  });
