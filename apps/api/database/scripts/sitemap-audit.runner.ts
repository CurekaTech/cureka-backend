/**
 * Read-only sitemap audit / data export CLI.
 *
 * Usage:
 *   npm run sitemap:audit categories
 *   npm run sitemap:audit brands -- --format=both
 *   npm run sitemap:audit all
 *   npm run sitemap:audit categories -- --status=active --eligible-only
 *   npm run sitemap:audit check -- --url=https://beta.cureka.com/product-brands/himalaya
 *   npm run sitemap:audit compare categories
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import {
  assertAuditType,
  SitemapAuditService,
} from '@modules/sitemap/audit/sitemap-audit.service';
import {
  AuditFilters,
  AuditOutputFormat,
  SITEMAP_AUDIT_TYPES,
} from '@modules/sitemap/audit/sitemap-audit.types';

const parseArgs = (argv: string[]) => {
  const positionals = argv.filter((arg) => !arg.startsWith('--'));
  const flags = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      flags.set(arg.slice(2), 'true');
    } else {
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    }
  }
  return { positionals, flags };
};

const parseFormat = (value: string | undefined): AuditOutputFormat => {
  if (!value || value === 'xlsx') return 'xlsx';
  if (value === 'csv' || value === 'both') return value;
  throw new Error(`Invalid --format="${value}". Use xlsx, csv, or both.`);
};

const parseFilters = (flags: Map<string, string>): AuditFilters => ({
  status: flags.get('status'),
  eligibleOnly: flags.get('eligible-only') === 'true',
  ineligibleOnly: flags.get('ineligible-only') === 'true',
  search: flags.get('search'),
  refId: flags.get('refId') ?? flags.get('ref-id'),
});

async function run(): Promise<void> {
  const { positionals, flags } = parseArgs(process.argv.slice(2));
  const command = positionals[0];
  if (!command) {
    throw new Error(
      `Missing command. Examples:\n` +
        `  npm run sitemap:audit categories\n` +
        `  npm run sitemap:audit all\n` +
        `  npm run sitemap:audit check -- --url=...\n` +
        `  npm run sitemap:audit compare categories\n` +
        `Supported types: ${SITEMAP_AUDIT_TYPES.join(', ')}`,
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const audit = app.get(SitemapAuditService);
    const format = parseFormat(flags.get('format'));
    const filters = parseFilters(flags);

    if (command === 'check') {
      const url = flags.get('url');
      if (!url) throw new Error('check requires --url=...');
      const result = await audit.checkUrl(url);
      console.log('');
      console.log('URL:');
      console.log(url);
      console.log('');
      console.log('Result:');
      console.log(result.found ? 'FOUND' : 'NOT FOUND');
      if (result.sitemapType) console.log(`Sitemap Type:\n${result.sitemapType}`);
      if (result.refId) console.log(`\nRef ID:\n${result.refId}`);
      if (result.name) console.log(`\nName:\n${result.name}`);
      if (result.slug) console.log(`\nSlug:\n${result.slug}`);
      if (result.status) console.log(`\nStatus:\n${result.status}`);
      if (result.deletedAt) console.log(`\nDeleted At:\n${result.deletedAt}`);
      if (result.found) {
        console.log(`\nSitemap Eligible:\n${result.sitemapEligible ? 'YES' : 'NO'}`);
        if (!result.sitemapEligible && result.exclusionReason) {
          console.log(`\nReason:\n${result.exclusionReason}`);
        }
      }
      console.log('');
      return;
    }

    if (command === 'compare') {
      const typeArg = positionals[1];
      if (!typeArg) throw new Error('compare requires a sitemap type, e.g. compare categories');
      const type = assertAuditType(typeArg);
      const result = await audit.compareType(type);
      console.log('');
      console.log('Sitemap audit compare completed.');
      console.log(`Type: ${result.type}`);
      console.log(`Eligible: ${result.eligibleCount}`);
      console.log(`Live locs: ${result.liveCount}`);
      console.log(`Matching: ${result.matching.length}`);
      console.log(`Missing from sitemap: ${result.missingFromSitemap.length}`);
      console.log(`Extra in sitemap: ${result.extraInSitemap.length}`);
      console.log(`Duplicate in sitemap: ${result.duplicateInSitemap.length}`);
      if (result.file) {
        console.log('');
        console.log('Output:');
        console.log(result.file);
      }
      console.log('');
      return;
    }

    if (command === 'all') {
      const result = await audit.exportAll({ format, filters });
      console.log('');
      console.log('Sitemap audit completed.');
      console.log('Type: all');
      for (const summary of result.summaries) {
        console.log(
          `  ${summary.sitemapType}: records=${summary.totalDbRecords} eligible=${summary.eligibleRecords}`,
        );
      }
      console.log('');
      console.log('Output:');
      for (const file of result.files) console.log(file);
      console.log('');
      return;
    }

    const type = assertAuditType(command);
    const result = await audit.exportType({ type, format, filters });
    console.log('');
    console.log('Sitemap audit completed.');
    console.log(`Type: ${result.summary.sitemapType}`);
    console.log(`Records: ${result.summary.totalDbRecords}`);
    console.log(`Eligible: ${result.summary.eligibleRecords}`);
    console.log(
      `Issues: ${
        result.summary.missingRefId +
        result.summary.missingSlug +
        result.summary.duplicateRefId +
        result.summary.duplicateSlug +
        result.summary.duplicateUrl +
        result.summary.invalidUrl
      }`,
    );
    console.log('');
    console.log('Output:');
    for (const file of result.files) console.log(file);
    console.log('');
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[sitemap:audit] failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
