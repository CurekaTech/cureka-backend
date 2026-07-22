import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as exceljs from 'exceljs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { extname } from 'path';
import { parseCsvLine } from '../utils/bulk-upload-csv.util';
import { resolveProductBulkBatchSize } from '../constants/bulk-batch.constant';
import { IProductPackMetadataItem } from '../interfaces/product-pack-metadata.interface';
import {
  BulkUploadProductInformationLabel,
  isFixedBulkUploadColumn,
  isDeprecatedBulkUploadColumn,
  isBulkUploadCategoryFilterColumn,
  isVariableBulkUploadColumn,
  normalizeBulkUploadHeader,
  parseCategoryFilterNameFromHeader,
  resolveProductInformationLabelName,
  sanitizeBulkUploadCellText,
} from '../utils/bulk-upload-columns.util';
import {
  VARIABLE_TEMPLATE_ATTRIBUTE_COUNT,
  parseAttributeDetailsFromRow,
} from '../utils/bulk-upload-variable.util';
import {
  isCommonMediaBulkUploadColumn,
  parseCommonMediaColumns,
  parsePrimaryAndGalleryImages,
  resolveBulkUploadSizeChart,
} from '../utils/bulk-upload-image.util';
import { normalizeExpiryDateInput } from '../utils/expiry-date.util';

export interface IParsedAttribute {
  name: string;
  refId?: string;
  value: string;
}

export interface IParsedImage {
  filename?: string;
  url?: string;
  isPrimary: boolean;
  sortOrder: number;
  /** Set when remote URL download/store fails; used for clearer bulk-upload errors. */
  resolveError?: string;
}

export interface IParsedVariant {
  rowNumber: number;
  sku: string;
  /** Optional variant slug from Product URL Slug. */
  productUrlSlug?: string;
  /** Per-row Product ID (String) for variant attach / persistence. */
  externalProductId?: string;
  displayName?: string;
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
  searchTags: string[];
  attributes: IParsedAttribute[];
  images: IParsedImage[];
  productInformation: Array<{ label: string; description: string; sortOrder?: number }>;
  faqs: { question: string; answer: string }[];
  metaTitle?: string;
  metaDescription?: string;
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
  manufacturer?: string;
  packer?: string;
  importer?: string;
  manufacturerAddress?: string;
  packerAddress?: string;
  importerAddress?: string;
  countryOfOrigin?: string;
  components?: string;
  expiresInMonths?: number;
  singleProductUrl?: string;
  healthConcerns: string[];
  wellnessGoals: string[];
  productTags: string[];
  packMetadata: IProductPackMetadataItem[];
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
  /** Upload binder for vertical variable rows (not persisted). */
  styleGroupId?: string;
  variableUploadMode?: 'explicit';
  attributeDetailNames?: string[];
  /** Shared media for variable products (type=common). */
  commonMedia: IParsedImage[];
  variants: IParsedVariant[];
  bundleItems: IParsedBundleItem[];
}

/** How many spreadsheet rows one parsed product group represents (not variant count). */
export const countSheetRowsForProductGroup = (group: IParsedProductGroup): number => {
  if (group.productType === 'variable' && group.variableUploadMode === 'explicit') {
    return new Set([group.rowNumber, ...group.variants.map((variant) => variant.rowNumber)]).size;
  }
  if (group.productType === 'bundle') {
    return new Set([group.rowNumber, ...group.bundleItems.map((item) => item.rowNumber)]).size;
  }
  return 1;
};

export const countVariantSlotsForProductGroup = (group: IParsedProductGroup): number =>
  Math.max(
    1,
    group.productType === 'bundle' ? group.bundleItems.length : group.variants.length,
  );

@Injectable()
export class BulkUploadParserService {
  private readonly logger = new Logger(BulkUploadParserService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Cleans header strings to allow flexible asterisk, space, and underscore matching.
   */
  private cleanHeader(str: string): string {
    return normalizeBulkUploadHeader(str);
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
    let text = '';
    if (typeof val === 'object') {
      if ('richText' in val && Array.isArray((val as any).richText)) {
        if (options?.preserveRichTextAsHtml) {
          return sanitizeBulkUploadCellText(this.richTextToHtml((val as any).richText));
        }
        text = (val as any).richText.map((t: any) => t.text || '').join('');
      } else if ('text' in val) {
        text = String((val as any).text);
      } else if ('result' in val) {
        text = String((val as any).result);
      } else {
        text = String(val);
      }
    } else {
      text = String(val);
    }
    return sanitizeBulkUploadCellText(text);
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

  private extractDynamicCategoryFilterColumns(
    worksheet: exceljs.Worksheet,
  ): Map<number, string> {
    const dynamicColumns = new Map<number, string>();
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const original = this.getCellText(cell).trim();
      if (!original) return;

      const filterName = parseCategoryFilterNameFromHeader(original);
      if (!filterName) return;

      dynamicColumns.set(colNumber, filterName);
    });
    return dynamicColumns;
  }

  private parseDynamicCategoryFilters(
    row: exceljs.Row,
    dynamicColumns: Map<number, string>,
  ): { categoryFilterRefId: string; values: string[] }[] {
    const bindings: { categoryFilterRefId: string; values: string[] }[] = [];
    for (const [columnIndex, filterName] of dynamicColumns.entries()) {
      const raw = this.getCellText(row.getCell(columnIndex));
      if (!raw.trim()) continue;
      const values = raw
        .split('|')
        .map((value) => value.trim())
        .filter(Boolean);
      if (!values.length) continue;
      bindings.push({
        // Resolver accepts both refId and name lookup keys.
        categoryFilterRefId: filterName,
        values,
      });
    }
    return bindings;
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
    activeCategoryFilterNames: ReadonlySet<string> = new Set(),
  ): Promise<number> {
    const isCsv = mimetype === 'text/csv' || extname(filePath).toLowerCase() === '.csv';
    const effectiveBatchSize = resolveProductBulkBatchSize(
      batchSize || this.configService.get<number>('PRODUCT_BULK_BATCH_SIZE'),
    );
    const maxRows = this.configService.get<number>('PRODUCT_BULK_UPLOAD_MAX_ROWS', 0);

    const groupedProducts = new Map<string, IParsedProductGroup>();
    const readyQueue: IParsedProductGroup[] = [];
    let scannedRowsCount = 0;
    let previousGroupingKey: string | null = null;
    let headerMap!: Map<string, number>;
    let productInformationColumnMap!: Map<number, { label: string; sortOrder: number }>;
    let dynamicCategoryFilterColumns!: Map<number, string>;

    const finalizeGroup = (group: IParsedProductGroup): IParsedProductGroup => {
      if (group.styleGroupId) {
        if (group.variants.length >= 2) {
          group.productType = 'variable';
          group.variableUploadMode = 'explicit';
        } else {
          group.productType = 'simple';
          group.variableUploadMode = undefined;
        }
      }
      return group;
    };

    const flushReadyQueue = async (force = false) => {
      while (readyQueue.length >= effectiveBatchSize || (force && readyQueue.length > 0)) {
        const batch = readyQueue.splice(0, effectiveBatchSize);
        await onBatch(batch, scannedRowsCount);
        if (!force && readyQueue.length < effectiveBatchSize) {
          break;
        }
      }
    };

    const flushCompletedGroup = async (groupingKey: string) => {
      const group = groupedProducts.get(groupingKey);
      if (!group) return;
      readyQueue.push(finalizeGroup(group));
      groupedProducts.delete(groupingKey);
      await flushReadyQueue();
    };

    const processRow = async (rowNumber: number, row: exceljs.Row) => {
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
      const productTypeRaw = (getVal('product type') || 'simple').toLowerCase();
      const vendorSku = getVal('vendor sku');
      const bundleSku = getVal('bundle sku');
      const styleGroupId = this.getFirstAvailable(getVal, [
        'style_group_id',
        'style group id',
        'style group',
      ]).trim();

      const productSkuCode = this.resolveProductSkuCode(getVal);
      const rowExternalProductId =
        this.getFirstAvailable(getVal, [
          'product id (string)',
          'product id',
          'product id string',
          'external product id',
          'woocommerce product id',
        ]) || undefined;

      // Skip row if it is completely empty
      if (!name && !vendorSku && !bundleSku && !productSkuCode && !styleGroupId) {
        return;
      }

      scannedRowsCount++;

      // Grouping: style_group_id binds vertical variants; otherwise one product per row (or bundle).
      let groupingKey = '';
      let effectiveProductType = productTypeRaw;
      if (productTypeRaw === 'bundle') {
        groupingKey = `bundle-${bundleSku || name}`;
      } else if (styleGroupId) {
        groupingKey = `style-${styleGroupId.toLowerCase()}`;
        // Will be coerced to simple vs variable after all rows for this key are collected.
        effectiveProductType = 'variable';
      } else {
        groupingKey = `simple-${rowNumber}`;
        effectiveProductType = productTypeRaw === 'variable' ? 'simple' : productTypeRaw;
      }

      if (previousGroupingKey && previousGroupingKey !== groupingKey) {
        await flushCompletedGroup(previousGroupingKey);
      }
      previousGroupingKey = groupingKey;

      let group = groupedProducts.get(groupingKey);
      const rowAttributeDetailNames = parseAttributeDetailsFromRow(getVal, headerMap);
      const isNewGroup = !group;

      if (!group) {
        group = {
          rowNumber,
          name,
          externalProductId: rowExternalProductId,
          singleProductUrl: getVal('single product url') || undefined,
          manufacturerAddress: getVal('manufacturer address') || undefined,
          packerAddress: getVal('packer address') || undefined,
          importerAddress: getVal('importer address') || undefined,
          packMetadata: this.parsePackMetadata(getVal),
          productNature: getVal('product nature'),
          productType: effectiveProductType,
          category: getVal('category'),
          subCategory: getVal('sub category') || undefined,
          subSubCategory: getVal('sub sub category') || undefined,
          subSubSubCategory: getVal('sub sub sub category') || undefined,
          brand: getVal('brand') || undefined,
          healthConcerns: getVal('health concerns')
            ? getVal('health concerns').split('|').map((s) => s.trim()).filter(Boolean)
            : [],
          wellnessGoals: getVal('wellness goals')
            ? getVal('wellness goals').split('|').map((s) => s.trim()).filter(Boolean)
            : [],
          productTags: getVal('product tags')
            ? getVal('product tags').split('|').map((s) => s.trim()).filter(Boolean)
            : [],
          vendor: this.getFirstAvailable(getVal, ['vendor', 'vendor name']) || undefined,
          vendorSku: vendorSku || undefined,
          productInformation,
          faqs: [],
          metaTitle: getVal('meta title') || undefined,
          metaDescription: getVal('meta description') || undefined,
          slugUrl: getVal('slug url') || undefined,
          metaKeywords: getVal('meta keywords')
            ? getVal('meta keywords').split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          categoryFilters: this.parseCategoryFilters(getVal('category filters')),
          sizeChart: resolveBulkUploadSizeChart(
            getVal('size chart url'),
            this.getFirstAvailable(getVal, ['size chart filename/path', 'size chart']),
          ),
          subscriptionEnabled: getVal('subscription available').toLowerCase() === 'yes',
          returnAllowed:
            getVal('return policy').toLowerCase().includes('return') ||
            getVal('return window days') !== '',
          returnPolicy: getVal('return policy') || undefined,
          returnWindowDays: getVal('return window days')
            ? parseInt(getVal('return window days'), 10)
            : undefined,
          codAvailable: getVal('cod available').toLowerCase() === 'yes',
          emiAvailable: getVal('emi available').toLowerCase() === 'yes',
          replaceAllowed: getVal('replacement allowed').toLowerCase() === 'yes',
          replaceWindowDays: getVal('replacement window days')
            ? parseInt(getVal('replacement window days'), 10)
            : undefined,
          status: getVal('product status') || undefined,
          manufacturer:
            this.getFirstAvailable(getVal, ['manufacturer', 'manufacturer name']) || undefined,
          packer: this.getFirstAvailable(getVal, ['packer', 'packer name']) || undefined,
          importer: this.getFirstAvailable(getVal, ['importer', 'importer name']) || undefined,
          countryOfOrigin: getVal('country of origin') || undefined,
          components: getVal('components') || undefined,
          expiresInMonths: getVal('shelf life in months')
            ? parseInt(getVal('shelf life in months'), 10)
            : undefined,
          styleGroupId: styleGroupId || undefined,
          variableUploadMode: styleGroupId ? 'explicit' : undefined,
          attributeDetailNames: rowAttributeDetailNames.length ? rowAttributeDetailNames : undefined,
          commonMedia: parseCommonMediaColumns(getVal, headerMap),
          variants: [],
          bundleItems: [],
        };
        const dynamicCategoryFilters = this.parseDynamicCategoryFilters(
          row,
          dynamicCategoryFilterColumns,
        );
        if (dynamicCategoryFilters.length) {
          group.categoryFilters = [...group.categoryFilters, ...dynamicCategoryFilters];
        }

        for (let i = 1; i <= 10; i++) {
          const question = getVal(`faq ${i} question`);
          const answer = getRichVal(`faq ${i} answer`);
          if (question && answer) {
            group.faqs.push({ question, answer });
          }
        }

        groupedProducts.set(groupingKey, group);
      } else {
        if (name && name !== group.name) {
          this.logger.warn(
            `[BULK_UPLOAD] style_group_id=${styleGroupId}: row ${rowNumber} name "${name}" differs from first row "${group.name}" (first row wins)`,
          );
        }
        const rowCommonMedia = parseCommonMediaColumns(getVal, headerMap);
        if (rowCommonMedia.length) {
          const existingKeys = new Set(
            group.commonMedia.map((item) => `${item.filename ?? ''}|${item.url ?? ''}`),
          );
          for (const item of rowCommonMedia) {
            const key = `${item.filename ?? ''}|${item.url ?? ''}`;
            if (existingKeys.has(key)) continue;
            group.commonMedia.push({
              ...item,
              isPrimary: group.commonMedia.length === 0,
              sortOrder: group.commonMedia.length,
            });
            existingKeys.add(key);
          }
        }

        if (rowAttributeDetailNames.length) {
          group.attributeDetailNames = rowAttributeDetailNames;
        } else if (productInformation.length && !styleGroupId) {
          group.productInformation = this.mergeProductInformation(
            group.productInformation,
            productInformation,
          );
        }
      }

      // Bundle rows
      if (productTypeRaw === 'bundle') {
        group.bundleItems.push({
          rowNumber,
          childSku: getVal('child sku'),
          quantity: parseInt(getVal('child quantity'), 10) || 1,
        });
        return;
      }

      // Vertical variant / simple row → one variant entry
      const mrp = parseFloat(getVal('mrp (rs)')) || 0;
      const sellingPrice =
        parseFloat(this.getFirstAvailable(getVal, ['selling price (rs)', 'discount price (rs)'])) ||
        0;
      const discountPercentage = this.normalizeDiscountPercentage(getVal('discount percentage'));
      const stock = parseInt(getVal('quantity / stock'), 10) || 0;
      const weight = parseFloat(getVal('weight (kg)')) || undefined;
      const length = parseFloat(getVal('length (cm)')) || undefined;
      const width = parseFloat(getVal('width (cm)')) || undefined;
      const height = parseFloat(getVal('height (cm)')) || undefined;

      const attributeDetailNames =
        group.attributeDetailNames?.length
          ? group.attributeDetailNames
          : parseAttributeDetailsFromRow(getVal, headerMap);
      const attributes = this.parseVariantAttributes(getVal, headerMap, attributeDetailNames);
      const images = this.parseVariantImages(getVal);
      const rowVariantContent = this.buildVariantContentFields({
        name,
        getVal,
        getRichVal,
        row,
        productInformation,
        dynamicCategoryFilterColumns,
      });

      group.variants.push({
        rowNumber,
        sku: productSkuCode,
        productUrlSlug:
          this.getFirstAvailable(getVal, ['product url slug', 'product_url_slug']) || undefined,
        externalProductId: rowExternalProductId,
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
        ...rowVariantContent,
      });

      void isNewGroup;
    };

    if (isCsv) {
      const stream = createReadStream(filePath, { encoding: 'utf8' });
      const lineReader = createInterface({ input: stream, crlfDelay: Infinity });
      let rowNumber = 0;
      for await (const line of lineReader) {
        if (!line.trim()) continue;
        rowNumber += 1;
        if (rowNumber === 1) {
          const headerCells = parseCsvLine(line);
          headerMap = this.extractHeadersFromValues(headerCells);
          this.validateRequiredHeaders(headerMap);
          this.validateCategoryFilterHeaders(headerMap, activeCategoryFilterNames);
          productInformationColumnMap = this.resolveProductInformationColumns(
            headerMap,
            activeProductInformationLabels,
          );
          dynamicCategoryFilterColumns = this.extractDynamicCategoryFilterColumnsFromValues(headerCells);
          continue;
        }

        if (maxRows > 0 && rowNumber - 1 > maxRows) {
          throw new BadRequestException(
            `The sheet contains more than ${maxRows} data rows, which exceeds the configured upload limit.`,
          );
        }

        const row = this.buildRowFromValues(parseCsvLine(line));
        await processRow(rowNumber, row);
      }
    } else {
      await this.parseXlsxAndBatch({
        filePath,
        maxRows,
        activeCategoryFilterNames,
        activeProductInformationLabels,
        onHeaders: (map, dynamicColumns, infoColumns) => {
          headerMap = map;
          dynamicCategoryFilterColumns = dynamicColumns;
          productInformationColumnMap = infoColumns;
        },
        processRow,
      });
    }

    if (previousGroupingKey) {
      await flushCompletedGroup(previousGroupingKey);
    }
    for (const groupingKey of [...groupedProducts.keys()]) {
      await flushCompletedGroup(groupingKey);
    }
    await flushReadyQueue(true);

    return scannedRowsCount;
  }

  private buildRowFromValues(values: string[]): exceljs.Row {
    const row = { values: ['', ...values] } as exceljs.Row;
    row.getCell = ((colNumber: number) => ({
      value: values[colNumber - 1] ?? '',
    })) as exceljs.Row['getCell'];
    return row;
  }

  private static readonly IMPORT_SHEET_NAME = 'bulk import template';
  private static readonly REFERENCE_SHEET_NAME_PATTERN =
    /(reference|dropdown|validation|instructions|readme)/i;
  private static readonly HEADER_SCAN_MAX_ROWS = 15;

  private async parseXlsxAndBatch(options: {
    filePath: string;
    maxRows: number;
    activeCategoryFilterNames: ReadonlySet<string>;
    activeProductInformationLabels: ReadonlyMap<string, BulkUploadProductInformationLabel>;
    onHeaders: (
      headerMap: Map<string, number>,
      dynamicColumns: Map<number, string>,
      productInformationColumnMap: Map<number, { label: string; sortOrder: number }>,
    ) => void;
    processRow: (rowNumber: number, row: exceljs.Row) => Promise<void>;
  }): Promise<void> {
    const {
      filePath,
      maxRows,
      activeCategoryFilterNames,
      activeProductInformationLabels,
      onHeaders,
      processRow,
    } = options;

    // Prefer buffered load so we can pick the correct sheet (not always worksheets[0]).
    // Streaming previously always consumed the first sheet, which fails when Excel puts a
    // reference/instructions sheet first, or when headers are not on row 1.
    const workbook = new exceljs.Workbook();
    await workbook.xlsx.readFile(filePath);
    if (!workbook.worksheets.length) {
      throw new BadRequestException('The uploaded file contains no worksheets.');
    }

    const worksheet = this.resolveImportWorksheet(workbook);
    const headerRowNumber = this.findHeaderRowNumber(worksheet);
    const headerRow = worksheet.getRow(headerRowNumber);
    const headerMap = this.extractHeadersFromRow(headerRow);
    this.validateRequiredHeaders(headerMap, worksheet.name);
    this.validateCategoryFilterHeaders(headerMap, activeCategoryFilterNames);
    const productInformationColumnMap = this.resolveProductInformationColumns(
      headerMap,
      activeProductInformationLabels,
    );
    const dynamicCategoryFilterColumns =
      this.extractDynamicCategoryFilterColumnsFromRow(headerRow);
    onHeaders(headerMap, dynamicCategoryFilterColumns, productInformationColumnMap);

    this.logger.log(
      `[BULK_UPLOAD] Using sheet "${worksheet.name}" with headers on row ${headerRowNumber} (${headerMap.size} columns)`,
    );

    let dataRowCount = 0;
    for (let excelRowNumber = headerRowNumber + 1; excelRowNumber <= worksheet.rowCount; excelRowNumber += 1) {
      const row = worksheet.getRow(excelRowNumber);
      if (this.isRowEmpty(row)) {
        continue;
      }

      dataRowCount += 1;
      if (maxRows > 0 && dataRowCount > maxRows) {
        throw new BadRequestException(
          `The sheet contains more than ${maxRows} data rows, which exceeds the configured upload limit.`,
        );
      }

      // Keep spreadsheet row numbers for error reports (1-based Excel row index).
      await processRow(excelRowNumber, row);
    }
  }

  private resolveImportWorksheet(workbook: exceljs.Workbook): exceljs.Worksheet {
    const sheets = workbook.worksheets.filter((sheet) => sheet?.name);
    if (!sheets.length) {
      throw new BadRequestException('The uploaded file contains no worksheets.');
    }

    const byExactName = sheets.find(
      (sheet) => sheet.name.trim().toLowerCase() === BulkUploadParserService.IMPORT_SHEET_NAME,
    );
    if (byExactName && this.rowHasRequiredHeaders(byExactName.getRow(this.findHeaderRowNumber(byExactName)))) {
      return byExactName;
    }

    const nonReference = sheets.filter(
      (sheet) => !BulkUploadParserService.REFERENCE_SHEET_NAME_PATTERN.test(sheet.name),
    );
    for (const sheet of nonReference.length ? nonReference : sheets) {
      try {
        const headerRowNumber = this.findHeaderRowNumber(sheet);
        if (this.rowHasRequiredHeaders(sheet.getRow(headerRowNumber))) {
          return sheet;
        }
      } catch {
        // try next sheet
      }
    }

    // Last resort: first non-reference sheet (validateRequiredHeaders will throw a clear error).
    return nonReference[0] ?? sheets[0];
  }

  private findHeaderRowNumber(worksheet: exceljs.Worksheet): number {
    const maxScan = Math.min(worksheet.rowCount || 1, BulkUploadParserService.HEADER_SCAN_MAX_ROWS);
    for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      if (this.rowHasRequiredHeaders(row)) {
        return rowNumber;
      }
    }
    return 1;
  }

  private rowHasRequiredHeaders(row: exceljs.Row): boolean {
    const headerMap = this.extractHeadersFromRow(row);
    return (
      headerMap.has('product name') &&
      headerMap.has('product type') &&
      headerMap.has('category')
    );
  }

  private isRowEmpty(row: exceljs.Row): boolean {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (this.getCellText(cell).trim()) {
        hasValue = true;
      }
    });
    if (hasValue) return false;

    // Streaming/buffered rows sometimes expose values[] without eachCell hits.
    const values = Array.isArray(row.values) ? row.values : [];
    return !values.some((value, index) => {
      if (index === 0) return false;
      if (value === null || value === undefined) return false;
      return String(value).trim().length > 0;
    });
  }

  private extractHeadersFromValues(values: string[]): Map<string, number> {
    const headerMap = new Map<string, number>();
    values.forEach((value, index) => {
      const cleaned = normalizeBulkUploadHeader(value);
      if (cleaned) {
        headerMap.set(cleaned, index + 1);
      }
    });
    return headerMap;
  }

  private extractHeadersFromRow(headerRow: exceljs.Row): Map<string, number> {
    const headerMap = new Map<string, number>();
    headerRow.eachCell((cell, colNumber) => {
      const val = this.getCellText(cell);
      const cleaned = normalizeBulkUploadHeader(val);
      if (cleaned) {
        headerMap.set(cleaned, colNumber);
      }
    });

    // Fallback: some Excel files expose headers only via row.values in edge cases.
    if (headerMap.size === 0 && Array.isArray(headerRow.values)) {
      const values = headerRow.values as Array<unknown>;
      for (let index = 1; index < values.length; index += 1) {
        const raw = values[index];
        const text =
          raw === null || raw === undefined
            ? ''
            : typeof raw === 'object'
              ? this.getCellText({ value: raw } as exceljs.Cell)
              : String(raw);
        const cleaned = normalizeBulkUploadHeader(text);
        if (cleaned) {
          headerMap.set(cleaned, index);
        }
      }
    }

    return headerMap;
  }

  private extractDynamicCategoryFilterColumnsFromValues(
    values: string[],
  ): Map<number, string> {
    const dynamicColumns = new Map<number, string>();
    values.forEach((value, index) => {
      const original = value.trim();
      if (!original) return;
      const filterName = parseCategoryFilterNameFromHeader(original);
      if (!filterName) return;
      dynamicColumns.set(index + 1, filterName);
    });
    return dynamicColumns;
  }

  private extractDynamicCategoryFilterColumnsFromRow(
    headerRow: exceljs.Row,
  ): Map<number, string> {
    const dynamicColumns = new Map<number, string>();
    headerRow.eachCell((cell, colNumber) => {
      const original = this.getCellText(cell).trim();
      if (!original) return;
      const filterName = parseCategoryFilterNameFromHeader(original);
      if (!filterName) return;
      dynamicColumns.set(colNumber, filterName);
    });
    return dynamicColumns;
  }

  private parseVariantImages(getVal: (columnName: string) => string): IParsedImage[] {
    return parsePrimaryAndGalleryImages(getVal, (names) => this.getFirstAvailable(getVal, names));
  }

  private parseVariantAttributes(
    getVal: (colName: string) => string,
    headerMap: Map<string, number>,
    attributeDetailNames: string[] = [],
  ): IParsedAttribute[] {
    const attributes: IParsedAttribute[] = [];
    const maxIndex = this.getMaxAttAttributeColumnIndex(headerMap);

    for (let index = 1; index <= maxIndex; index++) {
      const name = attributeDetailNames[index - 1];
      const value =
        getVal(`att_attribute_${index}_value_1`) ||
        getVal(`attribute ${index} value`) ||
        getVal(`att attribute ${index} value`);
      if (!value.trim() || !name?.trim()) continue;

      attributes.push({
        name,
        value,
      });
    }

    return attributes;
  }

  private getMaxAttAttributeColumnIndex(headerMap: Map<string, number>): number {
    let maxIndex = VARIABLE_TEMPLATE_ATTRIBUTE_COUNT;
    for (const header of headerMap.keys()) {
      const match = header.match(/^att_attribute_(\d+)_value_\d+$/);
      if (!match) continue;
      maxIndex = Math.max(maxIndex, parseInt(match[1], 10));
    }
    return maxIndex;
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
  private validateRequiredHeaders(headerMap: Map<string, number>, sheetName?: string): void {
    const required = ['product name', 'product type', 'category'];
    const missing: string[] = [];

    for (const req of required) {
      if (!headerMap.has(req)) {
        missing.push(req);
      }
    }

    if (missing.length > 0) {
      const detected = [...headerMap.keys()].slice(0, 12).join(', ') || '(none)';
      const sheetHint = sheetName ? ` on sheet "${sheetName}"` : '';
      throw new BadRequestException(
        `Invalid template. Missing mandatory columns${sheetHint}: ${missing.join(', ')}. ` +
          `Detected columns: ${detected}. ` +
          `Use the "Bulk Import Template" sheet with header columns Product Name*, Product Type *, Category *.`,
      );
    }
  }

  private validateCategoryFilterHeaders(
    headerMap: Map<string, number>,
    activeCategoryFilterNames: ReadonlySet<string>,
  ): void {
    // Unknown CF_* columns are ignored (older templates / deleted filters).
    // Active master filters are applied when cell values are present.
    void headerMap;
    void activeCategoryFilterNames;
  }

  private parseExpiryDate(raw: string): string | undefined {
    const normalized = normalizeExpiryDateInput(raw);
    return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
  }

  private resolveProductInformationColumns(
    headerMap: Map<string, number>,
    activeProductInformationLabels: ReadonlyMap<string, BulkUploadProductInformationLabel>,
  ): Map<number, { label: string; sortOrder: number }> {
    const unknownColumns: string[] = [];
    const columnMap = new Map<number, { label: string; sortOrder: number }>();

    for (const [normalizedHeader, columnIndex] of headerMap.entries()) {
      // style_group_id binds vertical variants — always treat as a fixed sheet column.
      if (/^style[\s_-]*group[\s_-]*id$/i.test(normalizedHeader.trim())) {
        continue;
      }

      if (isFixedBulkUploadColumn(normalizedHeader)) {
        continue;
      }

      if (isDeprecatedBulkUploadColumn(normalizedHeader)) {
        continue;
      }
      if (isBulkUploadCategoryFilterColumn(normalizedHeader)) {
        continue;
      }
      if (isVariableBulkUploadColumn(normalizedHeader)) {
        continue;
      }
      if (isCommonMediaBulkUploadColumn(normalizedHeader)) {
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
      { header: 'product highlights', label: 'Product Highlights' },
      { header: 'safety information', label: 'Safety Information' },
      { header: 'feeding table', label: 'Feeding Table' },
      { header: 'direction of use', label: 'Direction of Use' },
      { header: 'preventive note', label: 'Preventive Note' },
      { header: 'key ingredients', label: 'Key Ingredients' },
      { header: 'description', label: 'Description' },
      { header: 'size chart', label: 'Size Chart' },
      { header: 'accessories', label: 'Accessories' },
      { header: 'other ingredients', label: 'Other Ingredients' },
      { header: 'expert advice', label: 'Expert Advice' },
      { header: 'key benefits', label: 'Key Benefits' },
      { header: 'usage and safety', label: 'Usage and Safety' },
      { header: 'ingredients and nutrition', label: 'Ingredients and Nutrition' },
      { header: 'compliance detail', label: 'Compliance Detail' },
      { header: 'additional info', label: 'Additional Info' },
      { header: 'indications', label: 'Indications' },
      { header: 'kit contains', label: 'Kit Contains' },
      { header: 'offers', label: 'Offers' },
    ];

    const items: Array<{ label: string; description: string; sortOrder?: number }> = [];
    explicitColumns.forEach((item, index) => {
      const description = getRichVal(item.header).trim();
      if (!description) return;
      items.push({ label: item.label, description, sortOrder: 1000 + index });
    });
    return items;
  }

  private parseRowFaqs(
    getVal: (columnName: string) => string,
    getRichVal: (columnName: string) => string,
  ): Array<{ question: string; answer: string }> {
    const faqs: Array<{ question: string; answer: string }> = [];
    for (let i = 1; i <= 10; i++) {
      const question = getVal(`faq ${i} question`);
      const answer = getRichVal(`faq ${i} answer`);
      if (question && answer) {
        faqs.push({ question, answer });
      }
    }
    return faqs;
  }

  private buildVariantContentFields(options: {
    name: string;
    getVal: (columnName: string) => string;
    getRichVal: (columnName: string) => string;
    row: exceljs.Row;
    productInformation: Array<{ label: string; description: string; sortOrder?: number }>;
    dynamicCategoryFilterColumns: Map<number, string>;
  }): Omit<
    IParsedVariant,
    | 'rowNumber'
    | 'sku'
    | 'productUrlSlug'
    | 'externalProductId'
    | 'barcode'
    | 'gtinNumber'
    | 'hsnCode'
    | 'batchNumber'
    | 'expiryDate'
    | 'mrp'
    | 'sellingPrice'
    | 'discountPercentage'
    | 'taxClass'
    | 'stock'
    | 'weight'
    | 'weightUnit'
    | 'length'
    | 'lengthUnit'
    | 'width'
    | 'widthUnit'
    | 'height'
    | 'heightUnit'
    | 'status'
    | 'attributes'
    | 'images'
  > {
    const { name, getVal, getRichVal, row, productInformation, dynamicCategoryFilterColumns } =
      options;
    const dynamicCategoryFilters = this.parseDynamicCategoryFilters(
      row,
      dynamicCategoryFilterColumns,
    );
    const categoryFilters = [
      ...this.parseCategoryFilters(getVal('category filters')),
      ...dynamicCategoryFilters,
    ];

    return {
      displayName: name || undefined,
      productInformation,
      faqs: this.parseRowFaqs(getVal, getRichVal),
      metaTitle: getVal('meta title') || undefined,
      metaDescription: getVal('meta description') || undefined,
      metaKeywords: getVal('meta keywords')
        ? getVal('meta keywords').split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      categoryFilters,
      sizeChart: resolveBulkUploadSizeChart(
        getVal('size chart url'),
        this.getFirstAvailable(getVal, ['size chart filename/path', 'size chart']),
      ),
      subscriptionEnabled: getVal('subscription available').toLowerCase() === 'yes',
      returnAllowed:
        getVal('return policy').toLowerCase().includes('return') ||
        getVal('return window days') !== '',
      returnPolicy: getVal('return policy') || undefined,
      returnWindowDays: getVal('return window days')
        ? parseInt(getVal('return window days'), 10)
        : undefined,
      codAvailable: getVal('cod available').toLowerCase() === 'yes',
      emiAvailable: getVal('emi available').toLowerCase() === 'yes',
      replaceAllowed: getVal('replacement allowed').toLowerCase() === 'yes',
      replaceWindowDays: getVal('replacement window days')
        ? parseInt(getVal('replacement window days'), 10)
        : undefined,
      manufacturer:
        this.getFirstAvailable(getVal, ['manufacturer', 'manufacturer name']) || undefined,
      packer: this.getFirstAvailable(getVal, ['packer', 'packer name']) || undefined,
      importer: this.getFirstAvailable(getVal, ['importer', 'importer name']) || undefined,
      manufacturerAddress: getVal('manufacturer address') || undefined,
      packerAddress: getVal('packer address') || undefined,
      importerAddress: getVal('importer address') || undefined,
      countryOfOrigin: getVal('country of origin') || undefined,
      components: getVal('components') || undefined,
      expiresInMonths: getVal('shelf life in months')
        ? parseInt(getVal('shelf life in months'), 10)
        : undefined,
      singleProductUrl: getVal('single product url') || undefined,
      healthConcerns: getVal('health concerns')
        ? getVal('health concerns').split('|').map((s) => s.trim()).filter(Boolean)
        : [],
      wellnessGoals: getVal('wellness goals')
        ? getVal('wellness goals').split('|').map((s) => s.trim()).filter(Boolean)
        : [],
      productTags: getVal('product tags')
        ? getVal('product tags').split('|').map((s) => s.trim()).filter(Boolean)
        : [],
      searchTags: (() => {
        const raw = this.getFirstAvailable(getVal, ['search tags', 'tags']);
        return raw
          ? [
              ...new Set(
                raw
                  .split(/[,|]+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              ),
            ]
          : [];
      })(),
      packMetadata: this.parsePackMetadata(getVal),
    };
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
