import * as exceljs from 'exceljs';
import { join } from 'path';

type Column = { header: string; key: string };
type Row = Record<string, exceljs.CellValue>;

const runId = Date.now().toString().slice(-6);

const rich = (...segments: Array<{ text: string; bold?: boolean; italic?: boolean; underline?: boolean }>): exceljs.CellValue => ({
  richText: segments.map((segment) => ({
    text: segment.text,
    font: {
      bold: segment.bold,
      italic: segment.italic,
      underline: segment.underline,
    },
  })),
});

const columns: Column[] = [
  { header: 'Product Name*', key: 'productName' },
  { header: 'Product Nature *', key: 'productNature' },
  { header: 'Product Type *', key: 'productType' },
  { header: 'Category *', key: 'category' },
  { header: 'Sub Category', key: 'subCategory' },
  { header: 'Sub Sub Category', key: 'subSubCategory' },
  { header: 'Sub Sub Sub Category', key: 'subSubSubCategory' },
  { header: 'Brand', key: 'brand' },
  { header: 'Health Concerns', key: 'healthConcerns' },
  { header: 'Wellness Goals', key: 'wellnessGoals' },
  { header: 'Product Tags', key: 'productTags' },
  { header: 'Vendor', key: 'vendor' },
  { header: 'Vendor SKU', key: 'vendorSku' },
  { header: 'Attribute 1 Name', key: 'attr1Name' },
  { header: 'Attribute 1 Value', key: 'attr1Val' },
  { header: 'Attribute 2 Name', key: 'attr2Name' },
  { header: 'Attribute 2 Value', key: 'attr2Val' },
  { header: 'Attribute 3 Name', key: 'attr3Name' },
  { header: 'Attribute 3 Value', key: 'attr3Val' },
  { header: 'Bundle SKU', key: 'bundleSku' },
  { header: 'Bundle MRP (Rs)', key: 'bundleMrp' },
  { header: 'Bundle Selling Price (Rs)', key: 'bundleSellingPrice' },
  { header: 'Child Product Name', key: 'childName' },
  { header: 'Child SKU', key: 'childSku' },
  { header: 'Child MRP (Rs)', key: 'childMrp' },
  { header: 'Child Selling Price (Rs)', key: 'childSellingPrice' },
  { header: 'Child Quantity', key: 'childQty' },
  { header: 'SKU Code*', key: 'skuCode' },
  { header: 'Barcode (EAN/UPC)', key: 'barcode' },
  { header: 'MRP (Rs)*', key: 'mrp' },
  { header: 'Selling Price (Rs)*', key: 'sellingPrice' },
  { header: 'Discount Percentage', key: 'discount' },
  { header: 'Tax Class', key: 'taxClass' },
  { header: 'Quantity / Stock', key: 'stock' },
  { header: 'Weight (kg)', key: 'weight' },
  { header: 'Weight Unit', key: 'weightUnit' },
  { header: 'Length (cm)', key: 'length' },
  { header: 'Width (cm)', key: 'width' },
  { header: 'Height (cm)', key: 'height' },
  { header: 'Dimension Unit', key: 'dimensionUnit' },
  { header: 'Variant Status', key: 'variantStatus' },
  { header: 'Product Highlights', key: 'highlights' },
  { header: 'Description', key: 'description' },
  { header: 'Key Features', key: 'keyFeatures' },
  { header: 'Usage and Safety', key: 'usageSafety' },
  { header: 'Ingredients and Nutrition', key: 'ingredients' },
  { header: 'Compliance Detail', key: 'compliance' },
  { header: 'Additional Info', key: 'additionalInfo' },
  { header: 'Key Benefits', key: 'keyBenefits' },
  { header: 'Expert Advice', key: 'expertAdvice' },
  { header: 'Key Ingredients', key: 'keyIngredients' },
  { header: 'Other Ingredients', key: 'otherIngredients' },
  { header: 'Preventive Notes', key: 'preventiveNotes' },
  { header: 'Accessories', key: 'accessories' },
  { header: 'Direction of Use', key: 'directionOfUse' },
  { header: 'Feeding Table', key: 'feedingTable' },
  { header: 'Safety Information', key: 'safetyInformation' },
  { header: 'Indications', key: 'indications' },
  { header: 'Kit Contains', key: 'kitContains' },
  { header: 'Offers', key: 'offers' },
  { header: 'FAQ 1 Question', key: 'faq1q' },
  { header: 'FAQ 1 Answer', key: 'faq1a' },
  { header: 'FAQ 2 Question', key: 'faq2q' },
  { header: 'FAQ 2 Answer', key: 'faq2a' },
  { header: 'FAQ 3 Question', key: 'faq3q' },
  { header: 'FAQ 3 Answer', key: 'faq3a' },
  { header: 'Primary Image Filename', key: 'primaryImage' },
  { header: 'Gallery Image 2', key: 'gallery2' },
  { header: 'Gallery Image 3', key: 'gallery3' },
  { header: 'Gallery Image 4', key: 'gallery4' },
  { header: 'Gallery Image 5', key: 'gallery5' },
  { header: 'Meta Title', key: 'metaTitle' },
  { header: 'Meta Description', key: 'metaDescription' },
  { header: 'Slug URL', key: 'slug' },
  { header: 'Meta Keywords', key: 'metaKeywords' },
  { header: 'Category Filters', key: 'categoryFilters' },
  { header: 'Size Chart Filename/Path', key: 'sizeChart' },
  { header: 'Subscription Available', key: 'subscription' },
  { header: 'Return Policy', key: 'returnPolicy' },
  { header: 'Return Window Days', key: 'returnDays' },
  { header: 'COD Available', key: 'cod' },
  { header: 'EMI Available', key: 'emi' },
  { header: 'Replacement Allowed', key: 'replacement' },
  { header: 'Replacement Window Days', key: 'replacementDays' },
  { header: 'Manufacturer', key: 'manufacturer' },
  { header: 'Packer', key: 'packer' },
  { header: 'Importer', key: 'importer' },
  { header: 'Country of Origin', key: 'countryOfOrigin' },
  { header: 'Components', key: 'components' },
  { header: 'Shelf Life in Months', key: 'shelfLife' },
  { header: 'Product Status', key: 'status' },
];

const baseRow = (index: number): Row => ({
  productName: `Bulk Import Product ${runId}-${index}`,
  productNature: 'Gel',
  productType: 'simple',
  category: 'Health & Wellness',
  subCategory: 'Pain Relief Strong',
  subSubCategory: 'Tablets',
  subSubSubCategory: 'Paracetamol Tablets',
  brand: ' Meru Bio Herb',
  healthConcerns: 'Blood Pressure | Diabities',
  wellnessGoals: "Women's Healths",
  productTags: 'organic | daily-pill',
  vendor: 'MeruBio',
  vendorSku: `BULK-PARENT-${runId}-${index}`,
  attr1Name: 'Size',
  attr1Val: '100g',
  attr2Name: 'Color',
  attr2Val: 'Green',
  attr3Name: 'Flavor',
  attr3Val: 'Mint',
  bundleSku: `BUNDLE-${index}`,
  bundleMrp: '999',
  bundleSellingPrice: '899',
  childName: `Child Product ${index}`,
  childSku: `CHILD-SKU-${index}`,
  childMrp: '499',
  childSellingPrice: '449',
  childQty: '1',
  skuCode: `BULK-SKU-${runId}-${index}`,
  barcode: `890${runId}${String(index).padStart(4, '0')}`,
  mrp: '180',
  sellingPrice: '150',
  discount: '16.67',
  taxClass: 'GST 12%',
  stock: '150',
  weight: '120',
  weightUnit: 'g',
  length: '12',
  width: '6',
  height: '3',
  dimensionUnit: 'cm',
  variantStatus: 'active',
  highlights: rich(
    { text: 'Highly effective', bold: true },
    { text: ' | ' },
    { text: 'Long shelf life', italic: true },
  ),
  description: '<p><strong>Special formulation</strong> for standard daily use with <em>modern rich text</em>.</p>',
  keyFeatures: '<ul><li><strong>Easy to consume</strong></li><li>Lab tested</li></ul>',
  usageSafety: '<p>Use as directed by physician.</p>',
  ingredients: '<p><strong>Herbal extract</strong>, excipients, natural flavour.</p>',
  compliance: '<p>Manufactured in <strong>GMP certified</strong> facility.</p>',
  additionalInfo: '<p>Store in a <em>cool and dry</em> place.</p>',
  keyBenefits: rich(
    { text: 'Supports ', italic: true },
    { text: 'daily wellness', bold: true },
    { text: ' and routine care.' },
  ),
  expertAdvice: '<p><em>Consult physician before use.</em></p>',
  keyIngredients: '<p>Amla extract, zinc, vitamin blend.</p>',
  otherIngredients: '<p>Permitted stabilizers and natural flavours.</p>',
  preventiveNotes: '<p><strong>Keep away from children.</strong></p>',
  accessories: '<p>Measuring spoon included.</p>',
  directionOfUse: '<p>Take one serving daily after meals.</p>',
  feedingTable: '<table><tr><td>Adults</td><td>1 serving daily</td></tr></table>',
  safetyInformation: '<p>Do not exceed recommended dosage.</p>',
  indications: '<p>Daily nutrition support.</p>',
  kitContains: '<p>Bottle, leaflet, measuring spoon.</p>',
  offers: '<p><strong>Introductory offer</strong> available.</p>',
  faq1q: 'How to use?',
  faq1a: '<p>Take <strong>one serving</strong> daily.</p>',
  faq2q: 'Is it vegetarian?',
  faq2a: '<p>Yes.</p>',
  faq3q: 'Can children use it?',
  faq3a: rich(
    { text: 'Use only after ', italic: true },
    { text: 'medical advice', bold: true },
    { text: '.' },
  ),
  primaryImage: 'sample-front.jpg',
  gallery2: 'sample-side.jpg',
  gallery3: 'sample-back.jpg',
  gallery4: 'sample-label.jpg',
  gallery5: 'sample-lifestyle.jpg',
  metaTitle: `Bulk Import Product ${runId}-${index}`,
  metaDescription: 'Bulk upload sample product with all supported fields.',
  slug: `bulk-import-product-${runId}-${index}`,
  metaKeywords: 'bulk, import, sample',
  categoryFilters: '',
  sizeChart: 'documents/size-charts/sample-size-chart.pdf',
  subscription: 'yes',
  returnPolicy: '7 Days Returnable',
  returnDays: '7',
  cod: 'yes',
  emi: 'no',
  replacement: 'yes',
  replacementDays: '7',
  manufacturer: 'Cipla Ltd',
  packer: 'MedPack Solutions Pvt Ltd',
  importer: 'ABC Imports',
  countryOfOrigin: 'India',
  components: 'Bottle, leaflet, measuring spoon.',
  shelfLife: '24',
  status: 'draft',
});

const successRows = (): Row[] => [
  { ...baseRow(1), productName: `Success Simple Product Tablets ${runId}`, skuCode: `BULK-SUCCESS-SIMPLE-${runId}-001`, slug: `bulk-success-simple-product-tablets-${runId}` },
  { ...baseRow(2), productName: `Success Simple Product Gel ${runId}`, productNature: 'Gel', skuCode: `BULK-SUCCESS-SIMPLE-${runId}-002`, slug: `bulk-success-simple-product-gel-${runId}` },
  {
    ...baseRow(3),
    productName: `Success Variable Protein Powder ${runId}`,
    productNature: 'Powder',
    productType: 'variable',
    vendorSku: `BULK-SUCCESS-VARIABLE-${runId}-001`,
    skuCode: `BULK-SUCCESS-VAR-${runId}-RED-001`,
    attr1Name: 'Color',
    attr1Val: 'Red',
    attr2Name: 'Flavor',
    attr2Val: 'Chocolate',
    attr3Name: 'Size',
    attr3Val: '1kg',
    slug: `bulk-success-variable-protein-powder-${runId}`,
  },
  {
    ...baseRow(4),
    productName: `Success Variable Protein Powder ${runId}`,
    productNature: 'Powder',
    productType: 'variable',
    vendorSku: `BULK-SUCCESS-VARIABLE-${runId}-001`,
    skuCode: `BULK-SUCCESS-VAR-${runId}-BLUE-001`,
    attr1Name: 'Color',
    attr1Val: 'Blue',
    attr2Name: 'Flavor',
    attr2Val: 'Vanilla',
    attr3Name: 'Size',
    attr3Val: '1kg',
    slug: `bulk-success-variable-protein-powder-${runId}`,
  },
  {
    ...baseRow(5),
    productName: `Success Variable Protein Powder ${runId}`,
    productNature: 'Powder',
    productType: 'variable',
    vendorSku: `BULK-SUCCESS-VARIABLE-${runId}-001`,
    skuCode: `BULK-SUCCESS-VAR-${runId}-GREEN-001`,
    attr1Name: 'Color',
    attr1Val: 'Green',
    attr2Name: 'Flavor',
    attr2Val: 'Strawberry',
    attr3Name: 'Size',
    attr3Val: '1kg',
    slug: `bulk-success-variable-protein-powder-${runId}`,
  },
];

const failureRows = (): Row[] =>
  Array.from({ length: 210 }, (_, idx) => {
    const rowNumber = idx + 1;
    return {
      ...baseRow(rowNumber),
      productName: `Failure Product ${rowNumber}`,
      skuCode: `BULK-FAIL-${runId}-${String(rowNumber).padStart(3, '0')}`,
      mrp: '100',
      sellingPrice: '150',
      slug: `bulk-failure-product-${runId}-${rowNumber}`,
    };
  });

async function writeWorkbook(filename: string, rows: Row[]): Promise<void> {
  const workbook = new exceljs.Workbook();
  const worksheet = workbook.addWorksheet('Bulk Import Template');
  worksheet.columns = columns;
  rows.forEach((row) => worksheet.addRow(row));

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  worksheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(String(column.header ?? '').length + 4, 16), 34);
  });

  const destPath = join(process.cwd(), 'docs', filename);
  await workbook.xlsx.writeFile(destPath);
  console.log(`Created ${destPath} (${rows.length} data rows, ${columns.length} columns)`);
}

async function run(): Promise<void> {
  await writeWorkbook('bulk-upload-5-success.xlsx', successRows());
  await writeWorkbook('bulk-upload-210-failure.xlsx', failureRows());
  await writeWorkbook('bulk-upload-success-sheet.xlsx', successRows());
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
