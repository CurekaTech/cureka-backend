import { BadRequestException } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import * as ExcelJS from 'exceljs';
import { parseCsvLine } from '@modules/product/utils/bulk-upload-csv.util';
import { isValidIndianPincode, normalizePincode } from '@modules/cod-blocklist/utils/pincode.util';

export const PRODUCT_PINCODE_BULK_TEMPLATE_FILE_NAME = 'product-pincodes-template.xlsx';
export const PRODUCT_PINCODE_BULK_MAX_CODES = 20000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const HEADER_KEYS = new Set(['pincode', 'pin code', 'pin', 'pincodes']);

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const cellText = (value: ExcelJS.CellValue | undefined | null): string => {
  if (value == null) return '';
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('').trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return String(value);
    return value.toFixed(0);
  }
  return String(value).trim();
};

const isHeader = (value: string): boolean => HEADER_KEYS.has(normalizeHeader(value));

/**
 * The sheet is the full pincode list for one product. A header row named Pincode is
 * optional. Duplicate codes are ignored. Invalid rows fail the whole upload.
 */
export async function parseProductPincodeSheet(filename: string, buffer: Buffer): Promise<string[]> {
  const lower = filename.toLowerCase();
  const cells = lower.endsWith('.csv') ? parseCsvColumn(buffer) : await parseXlsxColumn(buffer);
  return collectPincodes(cells);
}

export async function buildProductPincodeTemplate(): Promise<{ fileName: string; fileBuffer: Buffer }> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Pincodes');
  sheet.addRow(['Pincode']);
  sheet.addRow(['380001']);
  sheet.addRow(['560001']);
  sheet.getRow(1).font = { bold: true };
  sheet.getColumn(1).width = 16;
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: PRODUCT_PINCODE_BULK_TEMPLATE_FILE_NAME,
    fileBuffer: Buffer.from(arrayBuffer),
  };
}

export async function readProductPincodeUpload(
  req: FastifyRequest,
): Promise<{ filename: string; buffer: Buffer }> {
  if (!req.isMultipart()) {
    throw new BadRequestException('Request must be multipart/form-data.');
  }

  const parts = req.parts({ limits: { fileSize: MAX_FILE_BYTES } });
  for await (const part of parts) {
    const filePart = part as {
      type?: string;
      file?: NodeJS.ReadableStream & { truncated?: boolean };
      fieldname?: string;
      filename?: string;
      mimetype?: string;
    };
    if (filePart.type !== 'file' || !filePart.file) continue;
    if (filePart.fieldname !== 'file') {
      filePart.file.resume();
      continue;
    }

    const filename = filePart.filename ?? '';
    const lower = filename.toLowerCase();
    const mime = filePart.mimetype ?? '';
    const allowed =
      lower.endsWith('.xlsx') ||
      lower.endsWith('.csv') ||
      mime.includes('spreadsheetml') ||
      mime === 'text/csv' ||
      mime === 'application/csv';
    if (!allowed) {
      filePart.file.resume();
      throw new BadRequestException(
        'Invalid file type. Only Excel (.xlsx) and CSV (.csv) files are allowed.',
      );
    }

    const chunks: Buffer[] = [];
    for await (const chunk of filePart.file) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (filePart.file.truncated) {
      throw new BadRequestException('File is too large. Maximum size is 10 MB.');
    }
    return { filename: filename || 'pincodes.xlsx', buffer: Buffer.concat(chunks) };
  }

  throw new BadRequestException('No file uploaded. Send multipart/form-data with a "file" field.');
}

function collectPincodes(cells: Array<{ rowNumber: number; value: string }>): string[] {
  const codes: string[] = [];
  const seen = new Set<string>();
  const invalid: string[] = [];

  for (const cell of cells) {
    const code = normalizePincode(cell.value);
    if (!code) continue;
    if (!isValidIndianPincode(code)) {
      if (invalid.length < 10) {
        invalid.push(`row ${cell.rowNumber} (${code})`);
      } else if (invalid.length === 10) {
        invalid.push('more');
      }
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  if (invalid.length) {
    const extra = invalid.includes('more') ? ' and more' : '';
    const listed = invalid.filter((item) => item !== 'more').join(', ');
    throw new BadRequestException(
      `Invalid pincodes: ${listed}${extra}. Each pincode must be 6 digits.`,
    );
  }
  if (!codes.length) {
    throw new BadRequestException('The sheet has no pincodes.');
  }
  if (codes.length > PRODUCT_PINCODE_BULK_MAX_CODES) {
    throw new BadRequestException(
      `A product can have at most ${PRODUCT_PINCODE_BULK_MAX_CODES} pincodes.`,
    );
  }
  return codes;
}

function parseCsvColumn(buffer: Buffer): Array<{ rowNumber: number; value: string }> {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const cells: Array<{ rowNumber: number; value: string }> = [];
  let started = false;

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const value = (parseCsvLine(line)[0] ?? '').trim();
    if (!started) {
      started = true;
      if (isHeader(value)) return;
    }
    cells.push({ rowNumber: index + 1, value });
  });

  return cells;
}

async function parseXlsxColumn(buffer: Buffer): Promise<Array<{ rowNumber: number; value: string }>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new BadRequestException('No worksheet found in the uploaded file.');
  }

  let column = 1;
  let headerRow = 0;
  const firstRow = worksheet.getRow(1);
  firstRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (headerRow) return;
    if (isHeader(cellText(cell.value))) {
      column = colNumber;
      headerRow = 1;
    }
  });

  const cells: Array<{ rowNumber: number; value: string }> = [];
  const start = headerRow ? headerRow + 1 : 1;
  for (let rowNumber = start; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const value = cellText(worksheet.getRow(rowNumber).getCell(column).value);
    if (!value) continue;
    cells.push({ rowNumber, value });
  }
  return cells;
}
