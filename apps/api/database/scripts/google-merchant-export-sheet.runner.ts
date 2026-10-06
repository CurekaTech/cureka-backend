/**
 * Export Google Merchant feed rows to a NEW xlsx for client sharing.
 * Never overwrites docs/Master-Data-Sheets/google-merchant-data.xlsx.
 *
 * Usage:
 *   npm run google-merchant:export-sheet
 *   npm run google-merchant:export-sheet -- --out=docs/Master-Data-Sheets/exports/custom.xlsx
 *   npm run google-merchant:export-sheet -- --env-label=techbv
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { GoogleMerchantFeedService } from '@modules/google-merchant/services/google-merchant-feed.service';

const LEGACY_SHEET_NAME = 'google-merchant-data.xlsx';

const parseArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const stamp = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

async function run(): Promise<void> {
  const envLabel =
    parseArg('env-label') ||
    process.env['GOOGLE_MERCHANT_EXPORT_ENV'] ||
    (process.env['STOREFRONT_URL'] ?? '')
      .replace(/^https?:\/\//, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() ||
    'local';

  const defaultOut = path.resolve(
    process.cwd(),
    'docs/Master-Data-Sheets/exports',
    `google-merchant-feed-${envLabel}-${stamp()}.xlsx`,
  );
  const outPath = path.resolve(process.cwd(), parseArg('out') || defaultOut);

  if (path.basename(outPath).toLowerCase() === LEGACY_SHEET_NAME) {
    throw new Error(
      `Refusing to overwrite legacy lookup workbook (${LEGACY_SHEET_NAME}). Choose a different --out path.`,
    );
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const feedService = app.get(GoogleMerchantFeedService);
    const baseUrl = feedService.getStorefrontBaseUrl();
    console.log('[google-merchant:export-sheet] building items…');
    console.log(`  STOREFRONT / baseUrl: ${baseUrl}`);
    console.log(`  out: ${outPath}`);

    const result = await feedService.buildItems();
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.columns = [
      { header: 'id', key: 'id', width: 18 },
      { header: 'title', key: 'title', width: 40 },
      { header: 'description', key: 'description', width: 50 },
      { header: 'link', key: 'link', width: 50 },
      { header: 'condition', key: 'condition', width: 10 },
      { header: 'price', key: 'price', width: 14 },
      { header: 'sale_price', key: 'sale_price', width: 14 },
      { header: 'availability', key: 'availability', width: 14 },
      { header: 'image link', key: 'image_link', width: 50 },
      { header: 'gtin', key: 'gtin', width: 16 },
      { header: 'mpn', key: 'mpn', width: 18 },
      { header: 'brand', key: 'brand', width: 18 },
      { header: 'google product category', key: 'gpc', width: 24 },
    ];

    for (const item of result.items) {
      sheet.addRow({
        id: item.id,
        title: item.title,
        description: item.description,
        link: item.link,
        condition: item.condition,
        price: item.price,
        sale_price: item.salePrice ?? '',
        availability: item.availability,
        image_link: item.imageLink,
        gtin: item.gtin ?? '',
        mpn: item.mpn,
        brand: item.brand,
        gpc: '',
      });
    }

    await workbook.xlsx.writeFile(outPath);

    console.log(
      `[google-merchant:export-sheet] complete rows=${result.itemCount} sheetIds=${result.sheetIdHits} generatedIds=${result.generatedIds}`,
    );
    console.log(`[google-merchant:export-sheet] wrote ${outPath}`);
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('[google-merchant:export-sheet] failed:', error);
    process.exit(1);
  });
