import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as exceljs from 'exceljs';
import { extname } from 'path';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import {
  BulkUploadProductInformationLabel,
  isFixedBulkUploadColumn,
  isDeprecatedBulkUploadColumn,
  normalizeBulkUploadHeader,
  resolveProductInformationLabelName,
} from '../utils/bulk-upload-columns.util';

export interface IParsedAttribute {
  name: string;
  value: string;
}

export interface IParsedImage {
  filename: string;
  isPrimary: boolean;
  sortOrder: number;
}

export interface IParsedVariant {
  rowNumber: number;
  sku: string;
  barcode?: string;
  gtinNumber?: string;
  hsnCode?: string;
  batchNumber?: string;
  expiryDate?: string;
  mrp: number;
  sellingPrice: number;
  discountPercentage?: number;
  taxClass?: string;
  stock: number;
  weight?: number;
  weightUnit?: string;
  length?: number;
  lengthUnit?: string;
  width?: number;
  widthUnit?: string;
  height?: number;
  heightUnit?: string;
  status?: string;
  attributes: IParsedAttribute[];
  images: IParsedImage[];
}

export interface IParsedBundleItem {
  rowNumber: number;
  childSku: string;
  quantity: number;
}

export interface IParsedProductGroup {
  rowNumber: number;
  name: string;
  externalProductId?: string;
  singleProductUrl?: string;
  manufacturerAddress?: string;
  packerAddress?: string;
  importerAddress?: string;
  packMetadata: IProductPackMetadataItem[];
  productNature?: string;
  productType: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  subSubSubCategory?: string;
  brand?: string;
  healthConcerns: string[];
  wellnessGoals: string[];
  productTags: string[];
  vendor?: string;
  vendorSku?: string;
  productInformation: Array<{ label: string; description: string; sortOrder?: number }>;
  faqs: { question: string; answer: string }[];
  metaTitle?: string;
  metaDescription?: string;
  slugUrl?: string;
  metaKeywords: string[];
  categoryFilters: { categoryFilterRefId: string; values: string[] }[];
  sizeChart?: string;
  subscriptionEnabled: boolean;
  returnAllowed: boolean;
  returnPolicy?: string;
  returnWindowDays?: number;
  codAvailable: boolean;
  emiAvailable: boolean;
  replaceAllowed: boolean;
  replaceWindowDays?: number;
  status?: string;
  manufacturer?: string;
  packer?: string;
  importer?: string;
  countryOfOrigin?: string;
  components?: string;
  expiresInMonths?: number;
  variants: IParsedVariant[];
  bundleItems: IParsedBundleItem[];
}

@Injectable()
export class BulkUploadParserService {
  private readonly logger = new Logger(BulkUploadParserService.name);

  /**
   * Cleans header strings to allow flexible, robust asterisk and space matching.
   */
  private cleanHeader(str: string): string {
    return str.toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  }

  /**
   * Resolves plain text value from ExcelJS cell, handling richText, formula result, and object formats.
   */
  private richTextToHtml(richText: Array<{ text?: string; font?: { bold?: boolean; italic?: boolean; underline?: boolean } }>): string {
    return richText
      .map((segment) => {
        const text = segment.text ?? '';
        if (!text) return '';

        let formatted = text;
        if (segment.font?.underline) formatted = `<u>${formatted}</u>`;
        if (segment.font?.italic) formatted = `<em>${formatted}</em>`;
        if (segment.font?.bold) formatted = `<strong>${formatted}</strong>`;
        return formatted;
      })
      .join('')
      .trim();
  }

  private getCellText(cell: exceljs.Cell, options?: { preserveRichTextAsHtml?: boolean }): string {
    const val = cell.value;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if ('richText' in val && Array.isArray((val as any).richText)) {
        if (options?.preserveRichTextAsHtml) {
          return this.richTextToHtml((val as any).richText);
        }
        return (val as any).richText.map((t: any) => t.text || '').join('').trim();
      }
      if ('text' in val) {
        return String((val as any).text).trim();
      }
      if ('result' in val) {
        return String((val as any).result).trim();
      }
    }
    return String(val).trim();
  }

  private parseCategoryFilters(raw: string): { categoryFilterRefId: string; values: string[] }[] {
    if (!raw.trim()) return [];

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const record = item as Record<string, unknown>;
            const categoryFilterRefId = String(record.categoryFilterRefId ?? '').trim();
            const values = Array.isArray(record.values)
              ? record.values.map((value) => String(value).trim()).filter(Boolean)
              : [];
            return categoryFilterRefId && values.length ? { categoryFilterRefId, values } : null;
          })
          .filter((item): item is { categoryFilterRefId: string; values: string[] } => Boolean(item));
      }
    } catch {
      // Fall through to compact spreadsheet syntax: CFL20261234:Red|Blue;CFL20264567:Large
    }

    return raw
      .split(';')
      .map((entry) => {
        const [refIdPart, valuesPart] = entry.split(':');
        const categoryFilterRefId = (refIdPart ?? '').trim();
        const values = (valuesPart ?? '')
          .split('|')
          .map((value) => value.trim())
          .filter(Boolean);
        return categoryFilterRefId && values.length ? { categoryFilterRefId, values } : null;
      })
      .filter((item): item is { categoryFilterRefId: string; values: string[] } => Boolean(item));
  }

  private resolveProductSkuCode(getVal: (colName: string) => string): string {
    return getVal('product sku code') || getVal('sku code');
  }

  private getFirstAvailable(getVal: (colName: string) => string, names: string[]): string {
    for (const name of names) {
      const value = getVal(name);
      if (value) return value;
    }
    return '';
  }

  private parsePackMetadata(getVal: (colName: string) => string): IProductPackMetadataItem[] {
    const packs: IProductPackMetadataItem[] = [];

    const addPack = (
      packNumber: number,
      fields: {
        name?: string;
        skuCode?: string;
        barcode?: string;
        productId?: string;
        url?: string;
        unit?: string;
        mrp?: string;
        sellingPrice?: string;
      },
    ): void => {
      const hasAnyValue = Object.values(fields).some((value) => value && value.trim());
      if (!hasAnyValue) return;

      const mrp = fields.mrp ? parseFloat(fields.mrp) : undefined;
      const sellingPrice = fields.sellingPrice ? parseFloat(fields.sellingPrice) : undefined;

      packs.push({
        packNumber,
        name: fields.name?.trim() || undefined,
        skuCode: fields.skuCode?.trim() || undefined,
        barcode: fields.barcode?.trim() || undefined,
        productId: fields.productId?.trim() || undefined,
        url: fields.url?.trim() || undefined,
        unit: fields.unit?.trim() || undefined,
        mrp: mrp !== undefined && !Number.isNaN(mrp) ? mrp : undefined,
        sellingPrice:
          sellingPrice !== undefined && !Number.isNaN(sellingPrice) ? sellingPrice : undefined,
      });
    };

    addPack(1, {
      skuCode: getVal('pack sku code 1'),
      barcode: getVal('barcode 1 (ean/upc)'),
      productId: getVal('pack product id 1'),
      url: getVal('url pack 1'),
      unit: getVal('pack unit 1'),
      mrp: getVal('pack mrp 1'),
      sellingPrice: getVal('pack selling price 1'),
    });

    for (let packNumber = 2; packNumber <= 4; packNumber++) {
      addPack(packNumber, {
        name: getVal(`pack name ${packNumber}`),
        skuCode: getVal(`pack sku code ${packNumber}`),
        barcode: getVal(`barcode ${packNumber} (ean/upc)`),
        productId: getVal(`pack product id ${packNumber}`),
        url: getVal(`url pack ${packNumber}`),
        unit: getVal(`pack unit ${packNumber}`),
        mrp: getVal(`pack mrp ${packNumber}`),
        sellingPrice: getVal(`pack selling price ${packNumber}`),
      });
    }

    return packs;
  }

  private normalizeDiscountPercentage(raw: string): number | undefined {
    const value = raw.trim();
    if (!value) return undefined;

    const parsed = parseFloat(value);
    if (Number.isNaN(parsed)) return undefined;

    // Excel percentage-formatted cells can arrive as 0.2 for 20%.
    if (parsed > 0 && parsed <= 1) {
      return parsed * 100;
    }

    return parsed;
  }

  /**
   * Reads an XLSX/CSV file stream, validates headers, groups rows, and returns chunk batches of grouped products.
   */
  async parseAndBatch(
    filePath: string,
    mimetype: string,
    batchSize: number,
    onBatch: (batch: IParsedProductGroup[], totalRowsScanned: number) => Promise<void>,
    activeProductInformationLabels: ReadonlyMap<string, BulkUploadProductInformationLabel>,
  ): Promise<number> {
    const isCsv = mimetype === 'text/csv' || extname(filePath).toLowerCase() === '.csv';
    const workbook = new exceljs.Workbook();
    
    if (isCsv) {
      await workbook.csv.readFile(filePath);
    } else {
      await workbook.xlsx.readFile(filePath);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('The uploaded file contains no worksheets.');
    }

    const totalDataRows = worksheet.rowCount - 1;
    if (totalDataRows > 1000) {
      throw new BadRequestException(
        `The sheet contains ${totalDataRows} data rows, which exceeds the maximum limit of 1000 rows per upload.`,
      );
    }

    const headerMap = this.extractHeaders(worksheet);
    this.validateRequiredHeaders(headerMap);
    const productInformationColumnMap = this.resolveProductInformationColumns(
      headerMap,
      activeProductInformationLabels,
    );

    const groupedProducts = new Map<string, IParsedProductGroup>();
    let batchBuffer: IParsedProductGroup[] = [];
    let scannedRowsCount = 0;

    const rowCount = worksheet.rowCount;
    for (let rowNumber = 2; rowNumber <= rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (!row) continue;

      const getVal = (colName: string): string => {
        const cleanedCol = this.cleanHeader(colName);
        const idx = headerMap.get(cleanedCol);
        if (idx === undefined) return '';
        const cell = row.getCell(idx);
        return this.getCellText(cell);
      };
      const getRichVal = (colName: string): string => {
        const cleanedCol = normalizeBulkUploadHeader(colName);
        const idx = headerMap.get(cleanedCol);
        if (idx === undefined) return '';
        const cell = row.getCell(idx);
        return this.getCellText(cell, { preserveRichTextAsHtml: true });
      };

      let productInformation = this.parseProductInformationRow(
        row,
        productInformationColumnMap,
      );
      productInformation = this.mergeProductInformation(
        productInformation,
        this.parseExplicitProductInformation(getRichVal),
      );

      const name = getVal('product name');
      const productType = (getVal('product type') || 'simple').toLowerCase();
      const vendorSku = getVal('vendor sku');
      const bundleSku = getVal('bundle sku');

      const productSkuCode = this.resolveProductSkuCode(getVal);

      // Skip row if it is completely empty
      if (!name && !vendorSku && !bundleSku && !productSkuCode) {
        continue;
      }

      scannedRowsCount++;

      // Define grouping key to tie parent and child variants/bundles together
      let groupingKey = '';
      if (productType === 'simple') {
        groupingKey = `simple-${rowNumber}`;
      } else if (productType === 'variable') {
        groupingKey = `variable-${vendorSku || name}`;
      } else if (productType === 'bundle') {
        groupingKey = `bundle-${bundleSku || name}`;
      }

      let group = groupedProducts.get(groupingKey);
      if (!group) {
        // Create new parent group
        group = {
          rowNumber,
          name,
          externalProductId:
            this.getFirstAvailable(getVal, ['product id (string)', 'product id', 'product id string']) ||
            undefined,
          singleProductUrl: getVal('single product url') || undefined,
          manufacturerAddress: getVal('manufacturer address') || undefined,
          packerAddress: getVal('packer address') || undefined,
          importerAddress: getVal('importer address') || undefined,
          packMetadata: this.parsePackMetadata(getVal),
          productNature: getVal('product nature'),
          productType,
          category: getVal('category'),
          subCategory: getVal('sub category') || undefined,
          subSubCategory: getVal('sub sub category') || undefined,
          subSubSubCategory: getVal('sub sub sub category') || undefined,
          brand: getVal('brand') || undefined,
          healthConcerns: getVal('health concerns') ? getVal('health concerns').split('|').map(s => s.trim()).filter(Boolean) : [],
          wellnessGoals: getVal('wellness goals') ? getVal('wellness goals').split('|').map(s => s.trim()).filter(Boolean) : [],
          productTags: getVal('product tags') ? getVal('product tags').split('|').map(s => s.trim()).filter(Boolean) : [],
          vendor: this.getFirstAvailable(getVal, ['vendor', 'vendor name']) || undefined,
          vendorSku: vendorSku || undefined,
          productInformation,
          faqs: [],
          metaTitle: getVal('meta title') || undefined,
          metaDescription: getVal('meta description') || undefined,
          slugUrl: getVal('slug url') || undefined,
          metaKeywords: getVal('meta keywords') ? getVal('meta keywords').split(',').map(s => s.trim()).filter(Boolean) : [],
          categoryFilters: this.parseCategoryFilters(getVal('category filters')),
          sizeChart: getVal('size chart filename/path') || getVal('size chart') || undefined,
          subscriptionEnabled: getVal('subscription available').toLowerCase() === 'yes',
          returnAllowed: getVal('return policy').toLowerCase().includes('return') || getVal('return window days') !== '',
          returnPolicy: getVal('return policy') || undefined,
          returnWindowDays: getVal('return window days') ? parseInt(getVal('return window days'), 10) : undefined,
          codAvailable: getVal('cod available').toLowerCase() === 'yes',
          emiAvailable: getVal('emi available').toLowerCase() === 'yes',
          replaceAllowed: getVal('replacement allowed').toLowerCase() === 'yes',
          replaceWindowDays: getVal('replacement window days') ? parseInt(getVal('replacement window days'), 10) : undefined,
          status: getVal('product status') || undefined,
          manufacturer: this.getFirstAvailable(getVal, ['manufacturer', 'manufacturer name']) || undefined,
          packer: this.getFirstAvailable(getVal, ['packer', 'packer name']) || undefined,
          importer: this.getFirstAvailable(getVal, ['importer', 'importer name']) || undefined,
          countryOfOrigin: getVal('country of origin') || undefined,
          components: getVal('components') || undefined,
          expiresInMonths: getVal('shelf life in months') ? parseInt(getVal('shelf life in months'), 10) : undefined,
          variants: [],
          bundleItems: [],
        };

        // Parse up to 10 FAQs
        for (let i = 1; i <= 10; i++) {
          const question = getVal(`faq ${i} question`);
          const answer = getRichVal(`faq ${i} answer`);
          if (question && answer) {
            group.faqs.push({ question, answer });
          }
        }

        groupedProducts.set(groupingKey, group);
        batchBuffer.push(group);
      } else if (productInformation.length) {
        group.productInformation = this.mergeProductInformation(
          group.productInformation,
          productInformation,
        );
      }

      // Add variant details if simple or variable
      if (productType === 'simple' || productType === 'variable') {
        const mrp = parseFloat(getVal('mrp (rs)')) || 0;
        const sellingPrice =
          parseFloat(this.getFirstAvailable(getVal, ['selling price (rs)', 'discount price (rs)'])) || 0;
        const discountPercentage = this.normalizeDiscountPercentage(getVal('discount percentage'));
        const stock = parseInt(getVal('quantity / stock'), 10) || 0;
        const weight = parseFloat(getVal('weight (kg)')) || undefined;
        const length = parseFloat(getVal('length (cm)')) || undefined;
        const width = parseFloat(getVal('width (cm)')) || undefined;
        const height = parseFloat(getVal('height (cm)')) || undefined;

        // Parse attributes
        const attributes: { name: string; value: string }[] = [];
        for (let i = 1; i <= 3; i++) {
          const attrName = getVal(`attribute ${i} name`);
          const attrVal = getVal(`attribute ${i} value`);
          if (attrName && attrVal) {
            attributes.push({ name: attrName, value: attrVal });
          }
        }

        // Parse images
        const images: { filename: string; isPrimary: boolean; sortOrder: number }[] = [];
        const primaryImg = getVal('primary image filename');
        if (primaryImg) {
          images.push({ filename: primaryImg, isPrimary: true, sortOrder: 0 });
        }
        for (let i = 2; i <= 5; i++) {
          const galleryImg =
            i === 2
              ? this.getFirstAvailable(getVal, ['gallery image 2', 'gallery image 2 (video)'])
              : getVal(`gallery image ${i}`);
          if (galleryImg) {
            images.push({ filename: galleryImg, isPrimary: false, sortOrder: i - 1 });
          }
        }

        group.variants.push({
          rowNumber,
          sku: productSkuCode,
          barcode: getVal('barcode (ean/upc)') || undefined,
          gtinNumber: getVal('gtin number') || undefined,
          hsnCode: getVal('hsn code') || undefined,
          batchNumber: getVal('batch number') || undefined,
          expiryDate: this.parseExpiryDate(getVal('expiry date')),
          mrp,
          sellingPrice,
          discountPercentage,
          taxClass: getVal('tax class') || undefined,
          stock,
          weight,
          weightUnit: getVal('weight unit') || undefined,
          length,
          lengthUnit: getVal('dimension unit') || undefined,
          width,
          widthUnit: getVal('dimension unit') || undefined,
          height,
          heightUnit: getVal('dimension unit') || undefined,
          status: getVal('variant status') || undefined,
          attributes,
          images,
        });
      }

      // Add bundle component details if bundle
      if (productType === 'bundle') {
        group.bundleItems.push({
          rowNumber,
          childSku: getVal('child sku'),
          quantity: parseInt(getVal('child quantity'), 10) || 1,
        });
      }

      // Trigger batch callback once buffer matches size
      if (batchBuffer.length >= batchSize) {
        await onBatch(batchBuffer, scannedRowsCount);
        batchBuffer = [];
      }
    }

    // Flush any remaining items in buffer
    if (batchBuffer.length > 0) {
      await onBatch(batchBuffer, scannedRowsCount);
    }

    return scannedRowsCount;
  }

  /**
   * Helper to inspect the header row and map column names to their cell index position.
   */
  private extractHeaders(worksheet: exceljs.Worksheet): Map<string, number> {
    const headerMap = new Map<string, number>();
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const val = this.getCellText(cell);
      const cleaned = normalizeBulkUploadHeader(val);
      if (cleaned) {
        headerMap.set(cleaned, colNumber);
      }
    });
    return headerMap;
  }

  /**
   * Assures sheet contains mandatory headers.
   */
  private validateRequiredHeaders(headerMap: Map<string, number>): void {
    const required = ['product name', 'product type', 'category'];
    const missing: string[] = [];

    for (const req of required) {
      if (!headerMap.has(req)) {
        missing.push(req);
      }
    }

    if (missing.length > 0) {
      throw new BadRequestException(
        `Invalid template. Missing mandatory columns: ${missing.join(', ')}`,
      );
    }
  }

  private parseExpiryDate(raw: string): string | undefined {
    const value = raw.trim();
    if (!value) return undefined;

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    return parsed.toISOString().slice(0, 10);
  }

  private resolveProductInformationColumns(
    headerMap: Map<string, number>,
    activeProductInformationLabels: ReadonlyMap<string, BulkUploadProductInformationLabel>,
  ): Map<number, { label: string; sortOrder: number }> {
    const unknownColumns: string[] = [];
    const columnMap = new Map<number, { label: string; sortOrder: number }>();

    for (const [normalizedHeader, columnIndex] of headerMap.entries()) {
      if (isFixedBulkUploadColumn(normalizedHeader)) {
        continue;
      }

      if (isDeprecatedBulkUploadColumn(normalizedHeader)) {
        continue;
      }

      const labelName = resolveProductInformationLabelName(
        normalizedHeader,
        activeProductInformationLabels,
      );
      if (!labelName) {
        unknownColumns.push(normalizedHeader);
        continue;
      }

      const label = activeProductInformationLabels.get(normalizeBulkUploadHeader(labelName));
      columnMap.set(columnIndex, {
        label: labelName,
        sortOrder: label?.sortOrder ?? 0,
      });
    }

    if (unknownColumns.length > 0) {
      throw new BadRequestException(
        `Invalid template. These columns are not recognized fixed fields or active product information labels: ${unknownColumns.join(', ')}`,
      );
    }

    return columnMap;
  }

  private parseProductInformationRow(
    row: exceljs.Row,
    productInformationColumnMap: Map<number, { label: string; sortOrder: number }>,
  ): Array<{ label: string; description: string; sortOrder?: number }> {
    const items: Array<{ label: string; description: string; sortOrder?: number }> = [];

    for (const [columnIndex, meta] of productInformationColumnMap.entries()) {
      const cell = row.getCell(columnIndex);
      const description = this.getCellText(cell, { preserveRichTextAsHtml: true });
      if (!description.trim()) {
        continue;
      }

      items.push({
        label: meta.label,
        description,
        sortOrder: meta.sortOrder,
      });
    }

    return items;
  }

  private parseExplicitProductInformation(
    getRichVal: (colName: string) => string,
  ): Array<{ label: string; description: string; sortOrder?: number }> {
    const explicitColumns: Array<{ header: string; label: string }> = [
      { header: 'key benefits', label: 'Key Benefits' },
      { header: 'expert advice', label: 'Expert Advice' },
      { header: 'key ingredients', label: 'Key Ingredients' },
      { header: 'other ingredients', label: 'Other Ingredients' },
    ];

    const items: Array<{ label: string; description: string; sortOrder?: number }> = [];
    explicitColumns.forEach((item, index) => {
      const description = getRichVal(item.header).trim();
      if (!description) return;
      items.push({ label: item.label, description, sortOrder: 1000 + index });
    });
    return items;
  }

  private mergeProductInformation(
    existing: Array<{ label: string; description: string; sortOrder?: number }>,
    incoming: Array<{ label: string; description: string; sortOrder?: number }>,
  ): Array<{ label: string; description: string; sortOrder?: number }> {
    const merged = new Map(existing.map((item) => [item.label.toLowerCase(), item]));

    for (const item of incoming) {
      merged.set(item.label.toLowerCase(), item);
    }

    return Array.from(merged.values());
  }
}
