import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as exceljs from 'exceljs';
import { extname } from 'path';

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
  mrp: number;
  sellingPrice: number;
  discountPercentage?: number;
  taxClass?: string;
  stock: number;
  weight?: number;
  length?: number;
  width?: number;
  height?: number;
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
  productNature: string;
  productType: string;
  category: string;
  subCategory?: string;
  subSubCategory?: string;
  subSubSubCategory?: string;
  brand?: string;
  healthConcerns: string[];
  productTags: string[];
  vendor?: string;
  vendorSku?: string;
  description?: string;
  highlights: string[];
  keyFeatures: string[];
  usageAndSafety?: string;
  ingredientsAndNutrition?: string;
  complianceDetail?: string;
  additionalInfo?: string;
  metaTitle?: string;
  metaDescription?: string;
  slugUrl?: string;
  metaKeywords: string[];
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
  private getCellText(cell: exceljs.Cell): string {
    const val = cell.value;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if ('richText' in val && Array.isArray((val as any).richText)) {
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

  /**
   * Reads an XLSX/CSV file stream, validates headers, groups rows, and returns chunk batches of grouped products.
   */
  async parseAndBatch(
    filePath: string,
    mimetype: string,
    batchSize: number,
    onBatch: (batch: IParsedProductGroup[], totalRowsScanned: number) => Promise<void>,
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

      const name = getVal('product name');
      const productType = (getVal('product type') || 'simple').toLowerCase();
      const vendorSku = getVal('vendor sku');
      const bundleSku = getVal('bundle sku');

      // Skip row if it is completely empty
      if (!name && !vendorSku && !bundleSku && !getVal('sku code')) {
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
          productNature: getVal('product nature'),
          productType,
          category: getVal('category'),
          subCategory: getVal('sub category') || undefined,
          subSubCategory: getVal('sub sub category') || undefined,
          subSubSubCategory: getVal('sub sub sub category') || undefined,
          brand: getVal('brand') || undefined,
          healthConcerns: getVal('health concerns') ? getVal('health concerns').split('|').map(s => s.trim()).filter(Boolean) : [],
          productTags: getVal('product tags') ? getVal('product tags').split('|').map(s => s.trim()).filter(Boolean) : [],
          vendor: getVal('vendor') || undefined,
          vendorSku: vendorSku || undefined,
          description: getVal('description') || undefined,
          highlights: getVal('product highlights') ? getVal('product highlights').split('|').map(s => s.trim()).filter(Boolean) : [],
          keyFeatures: getVal('key features') ? getVal('key features').split('|').map(s => s.trim()).filter(Boolean) : [],
          usageAndSafety: getVal('usage and safety') || undefined,
          ingredientsAndNutrition: getVal('ingredients and nutrition') || undefined,
          complianceDetail: getVal('compliance detail') || undefined,
          additionalInfo: getVal('additional info') || undefined,
          metaTitle: getVal('meta title') || undefined,
          metaDescription: getVal('meta description') || undefined,
          slugUrl: getVal('slug url') || undefined,
          metaKeywords: getVal('meta keywords') ? getVal('meta keywords').split(',').map(s => s.trim()).filter(Boolean) : [],
          subscriptionEnabled: getVal('subscription available').toLowerCase() === 'yes',
          returnAllowed: getVal('return policy').toLowerCase().includes('return') || getVal('return window days') !== '',
          returnPolicy: getVal('return policy') || undefined,
          returnWindowDays: getVal('return window days') ? parseInt(getVal('return window days'), 10) : undefined,
          codAvailable: getVal('cod available').toLowerCase() === 'yes',
          emiAvailable: getVal('emi available').toLowerCase() === 'yes',
          replaceAllowed: getVal('replacement allowed').toLowerCase() === 'yes',
          replaceWindowDays: getVal('replacement window days') ? parseInt(getVal('replacement window days'), 10) : undefined,
          status: getVal('product status') || undefined,
          manufacturer: getVal('manufacturer') || undefined,
          packer: getVal('packer') || undefined,
          importer: getVal('importer') || undefined,
          countryOfOrigin: getVal('country of origin') || undefined,
          components: getVal('components') || undefined,
          expiresInMonths: getVal('shelf life in months') ? parseInt(getVal('shelf life in months'), 10) : undefined,
          variants: [],
          bundleItems: [],
        };
        groupedProducts.set(groupingKey, group);
        batchBuffer.push(group);
      }

      // Add variant details if simple or variable
      if (productType === 'simple' || productType === 'variable') {
        const mrp = parseFloat(getVal('mrp (rs)')) || 0;
        const sellingPrice = parseFloat(getVal('selling price (rs)')) || 0;
        const discountPercentage = parseFloat(getVal('discount percentage')) || undefined;
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
        for (let i = 2; i <= 3; i++) {
          const galleryImg = getVal(`gallery image ${i}`);
          if (galleryImg) {
            images.push({ filename: galleryImg, isPrimary: false, sortOrder: i - 1 });
          }
        }

        group.variants.push({
          rowNumber,
          sku: getVal('sku code'),
          barcode: getVal('barcode (ean/upc)') || undefined,
          mrp,
          sellingPrice,
          discountPercentage,
          taxClass: getVal('tax class') || undefined,
          stock,
          weight,
          length,
          width,
          height,
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
      const cleaned = this.cleanHeader(val);
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
    const required = ['product name', 'product nature', 'product type', 'category'];
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
}
