/**
 * Generates docs/bulk-upload-style-group-vertical-test.xlsx
 * Run: npx ts-node -r tsconfig-paths/register scripts/generate-vertical-bulk-test-xlsx.ts
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import * as ExcelJS from 'exceljs';
import { buildUnifiedBulkUploadHeaders } from '../modules/product/utils/bulk-upload-columns.util';

const STYLE_GROUP_ID = '9201';
const PRODUCT_IDS = ['562308', '562309', '565252'] as const;
const SIZES = ['Small', 'Medium', 'Large'] as const;

const headers = buildUnifiedBulkUploadHeaders();

const suffix = (size: string) => size.toLowerCase();

const buildRow = (size: (typeof SIZES)[number], index: number): Record<string, string | number> => {
  const s = suffix(size);
  const stamp = '9201';
  const productId = PRODUCT_IDS[index];
  return {
    'Product Name*': `Cureka Vertical Variant Test ${size}`,
    'Product Type *': 'variable',
    'Category *': 'Healthcare Devices',
    'Sub Category': 'Supports, Splints & Braces',
    'Brand*': '3M',
    style_group_id: STYLE_GROUP_ID,
    'Product ID (String)': productId,
    'Product SKU Code*': `VERT/3M/${size.toUpperCase().slice(0, 3)}-${stamp}`,
    'Barcode (EAN/UPC)': `8901${productId}`,
    'HSN Code': `6109100${index}`,
    'MRP (Rs)*': 699 + index * 100,
    'Selling Price (Rs)*': 549 + index * 80,
    'Discount Percentage': 21 + index,
    'Tax Class': 'GST 12%',
    'Quantity / Stock': 25 + index * 15,
    'Weight (kg)': 0.18 + index * 0.04,
    'Weight Unit': 'kg',
    'Length (cm)': 28 + index * 2,
    'Width (cm)': 20 + index * 2,
    'Height (cm)': 2 + index,
    'Dimension Unit': 'cm',
    'Variant Status': 'active',
    'Product Highlights': `${size} highlight — unique copy for ${s} variant row.`,
    Description: `${size} description — full product copy for the ${s} variant only.`,
    'Slug URL': 'cureka-vertical-variant-test',
    'Product URL Slug': `cureka-vertical-variant-test-${s}`,
    'Product Status': 'published',
    'Meta Title': `${size} Meta Title ${stamp}`,
    'Meta Description': `${size} meta description text ${stamp}`,
    'Meta Keywords': `${s},variant,test,${stamp}`,
    'Health Concerns': index === 0 ? 'Arthritis' : index === 1 ? 'Back Pain' : 'Pain Relief',
    'Wellness Goals': index === 0 ? 'Immunity' : index === 1 ? 'Energy' : 'Recovery',
    'Product Tags': `${size} Tag|Bulk Test ${stamp}`,
    'Subscription Available': index === 0 ? 'Yes' : 'No',
    'COD Available': 'Yes',
    'EMI Available': index === 1 ? 'Yes' : 'No',
    'Return Policy': `Return within ${7 + index} days for ${s}`,
    'Return Window Days': 7 + index,
    'Replacement Allowed': index === 2 ? 'Yes' : 'No',
    'Replacement Window Days': 5 + index,
    'Country of Origin': 'India',
    Components: `${size} components list ${stamp}`,
    'Shelf Life in Months': 12 + index,
    'Single Product URL': `https://example.com/products/${s}-${stamp}`,
    'Safety Information': `${size} safety info ${stamp}`,
    'Direction of Use': `${size} directions ${stamp}`,
    'Preventive Note': `${size} preventive note ${stamp}`,
    'Key Ingredients': `${size} key ingredients ${stamp}`,
    'Key Benefits': `${size} key benefits ${stamp}`,
    'Expert Advice': `${size} expert advice ${stamp}`,
    'Other Ingredients': `${size} other ingredients ${stamp}`,
    'Usage and Safety': `${size} usage and safety ${stamp}`,
    'Ingredients and Nutrition': `${size} nutrition ${stamp}`,
    'Compliance Detail': `${size} compliance ${stamp}`,
    'Additional Info': `${size} additional info ${stamp}`,
    'Indications': `${size} indications ${stamp}`,
    'Kit Contains': `${size} kit contains ${stamp}`,
    Offers: `${size} offers ${stamp}`,
    'FAQ 1 Question': `What is special about ${size}?`,
    'FAQ 1 Answer': `${size} answer row ${stamp}`,
    'FAQ 2 Question': `How to use ${size}?`,
    'FAQ 2 Answer': `${size} usage answer ${stamp}`,
    'FAQ 3 Question': `Return policy for ${size}?`,
    'FAQ 3 Answer': `${size} return answer ${stamp}`,
    'Attribute Details 1': 'Size',
    att_attribute_1_value_1: size,
  };
};

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Bulk Import');
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };

  for (let i = 0; i < SIZES.length; i++) {
    const values = buildRow(SIZES[i], i);
    ws.addRow(headers.map((header) => values[header] ?? null));
  }

  headers.forEach((header, index) => {
    ws.getColumn(index + 1).width = Math.min(Math.max(header.length + 2, 14), 36);
  });

  const outPath = join(process.cwd(), 'docs/bulk-upload-style-group-vertical-test.xlsx');
  const buffer = await wb.xlsx.writeBuffer();
  writeFileSync(outPath, Buffer.from(buffer));
  console.log(`Wrote ${outPath} (${headers.length} columns, 3 rows)`);
})();
