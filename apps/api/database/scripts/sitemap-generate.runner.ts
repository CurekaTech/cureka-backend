/**
 * Full sitemap generation for all groups.
 *
 * Usage:
 *   npm run sitemap:generate
 *   npm run sitemap:generate -- --group=products
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { SitemapGeneratorService } from '@modules/sitemap/services/sitemap-generator.service';
import { isSitemapGroup } from '@modules/sitemap/config/sitemap-groups';

async function run(): Promise<void> {
  const groupArg = process.argv.find((arg) => arg.startsWith('--group='))?.slice('--group='.length);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const generator = app.get(SitemapGeneratorService);
    const result = groupArg
      ? isSitemapGroup(groupArg)
        ? await generator.generateGroup(groupArg)
        : (() => {
            throw new Error(`Unknown sitemap group "${groupArg}"`);
          })()
      : await generator.generateAll();

    console.log(
      `[sitemap:generate] complete — groups=${result.groups.join(',')} urls=${result.urlCount} files=${result.fileCount} durationMs=${result.durationMs}`,
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
