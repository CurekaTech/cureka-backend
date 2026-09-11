import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { Readable } from 'stream';
import { formatValidationErrorMessage, formatValidationErrorsForLog } from '@packages/common';
import { StorageService } from '@packages/storage';
import { validateBlogFeaturedImageBuffer } from '../utils/validate-blog-featured-image.util';
import { UploadFolder } from '../enums/upload-folder.enum';

export type MultipartFileFieldMap = Record<string, UploadFolder>;

export type IndexedFileFieldRule = {
  prefix: string;
  folder: UploadFolder;
};

export type ParseAndValidateOptions = {
  indexedFileFields?: IndexedFileFieldRule[];
};

/** Uploaded object path, or `null` when the client explicitly cleared the media field. */
export type MultipartUploadedUrls = Record<string, string | null>;

const isMediaClearValue = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return true;
  if (trimmed === '{}' || trimmed === '[]') return true;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null) return true;
    if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed as object).length === 0) {
      return true;
    }
  } catch {
    // not JSON — fall through
  }
  return false;
};

@Injectable()
export class MultipartFormService {
  private readonly logger = new Logger(MultipartFormService.name);

  constructor(private readonly storageService: StorageService) {}

  async parseAndValidate<T extends object>(
    req: FastifyRequest,
    dtoClass: ClassConstructor<T>,
    fileFields: MultipartFileFieldMap,
    options?: ParseAndValidateOptions,
  ): Promise<{ dto: T; uploadedUrls: MultipartUploadedUrls }> {
    const { fields, uploadedUrls } = await this.parseMultipart(req, fileFields, options);
    const mergedFields = this.mergeFormFields(fields);
    this.applyMediaClearSignals(mergedFields, fileFields, uploadedUrls, options);
    const dto = await this.validateDto(
      dtoClass,
      this.sanitizeDtoFields(mergedFields, fileFields, options),
    );
    return { dto, uploadedUrls };
  }

  /** Supports individual text fields OR a single JSON "data" field alongside files. */
  private mergeFormFields(fields: Record<string, string>): Record<string, string> {
    const { data, ...rest } = fields;

    if (!data) {
      return rest;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON in form field "data"');
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new BadRequestException('Form field "data" must be a JSON object');
    }

    const merged: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined || value === null) {
        // Preserve explicit null clears for known media fields (handled later).
        merged[key] = 'null';
        continue;
      }
      merged[key] =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    return { ...merged, ...rest };
  }

  /**
   * When Admin sends `banner: {}` / `banner: null` (no file), treat it as clear:
   * set uploadedUrls[field] = null so services can null the DB column.
   * A real uploaded file always wins over a clear placeholder.
   */
  private applyMediaClearSignals(
    fields: Record<string, string>,
    fileFields: MultipartFileFieldMap,
    uploadedUrls: MultipartUploadedUrls,
    options?: ParseAndValidateOptions,
  ): void {
    const fieldNames = new Set([
      ...Object.keys(fileFields),
      ...Object.keys(fields).filter((key) => this.isIndexedFileField(key, options)),
    ]);

    for (const fieldName of fieldNames) {
      if (Object.prototype.hasOwnProperty.call(uploadedUrls, fieldName)) continue;
      if (isMediaClearValue(fields[fieldName])) {
        uploadedUrls[fieldName] = null;
      }
    }
  }

  /**
   * Clients often send file fields as text placeholders (`banner=null`, `banner={}`) and empty
   * optional fields. Those are not DTO properties and trip forbidNonWhitelisted.
   * Real uploads / clears are already captured in `uploadedUrls`.
   */
  private sanitizeDtoFields(
    fields: Record<string, string>,
    fileFields: MultipartFileFieldMap,
    options?: ParseAndValidateOptions,
  ): Record<string, string> {
    const cleaned: Record<string, string> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (key in fileFields || this.isIndexedFileField(key, options)) continue;

      const trimmed = value.trim();
      if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') continue;

      cleaned[key] = value;
    }

    return cleaned;
  }

  private isIndexedFileField(fieldname: string, options?: ParseAndValidateOptions): boolean {
    return this.resolveIndexedFolder(fieldname, options) !== undefined;
  }

  private resolveIndexedFolder(
    fieldname: string,
    options?: ParseAndValidateOptions,
  ): UploadFolder | undefined {
    for (const rule of options?.indexedFileFields ?? []) {
      // Exact prefix (e.g. repeated "photos") or indexed "photos0" / "evidenceFile1"
      if (fieldname === rule.prefix) return rule.folder;
      if (!fieldname.startsWith(rule.prefix)) continue;
      const suffix = fieldname.slice(rule.prefix.length);
      if (/^\d+$/.test(suffix)) return rule.folder;
    }
    return undefined;
  }

  private resolveFileFolder(
    fieldname: string,
    fileFields: MultipartFileFieldMap,
    options?: ParseAndValidateOptions,
  ): UploadFolder | undefined {
    return fileFields[fieldname] ?? this.resolveIndexedFolder(fieldname, options);
  }

  /**
   * When clients send the same field name multiple times (e.g. `photos`), store as
   * `photos0`, `photos1`, … so later evidence mapping can collect all of them.
   */
  private resolveStorageKey(
    fieldname: string,
    uploadedUrls: MultipartUploadedUrls,
    options?: ParseAndValidateOptions,
  ): string {
    for (const rule of options?.indexedFileFields ?? []) {
      if (fieldname !== rule.prefix) continue;
      let index = 0;
      while (Object.prototype.hasOwnProperty.call(uploadedUrls, `${rule.prefix}${index}`)) {
        index += 1;
      }
      return `${rule.prefix}${index}`;
    }
    return fieldname;
  }

  private async parseMultipart(
    req: FastifyRequest,
    fileFields: MultipartFileFieldMap,
    options?: ParseAndValidateOptions,
  ): Promise<{ fields: Record<string, string>; uploadedUrls: MultipartUploadedUrls }> {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new BadRequestException(
        'Content-Type must be multipart/form-data when uploading logo, banner, or image files.',
      );
    }

    const rawFields: Record<string, string[]> = {};
    const uploadedUrls: MultipartUploadedUrls = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        await this.handleFilePart(part, fileFields, uploadedUrls, options);
      } else {
        const val = part.value as string;
        if (rawFields[part.fieldname]) {
          rawFields[part.fieldname].push(val);
        } else {
          rawFields[part.fieldname] = [val];
        }
      }
    }

    // Collapse single-value fields to a plain string; multi-value fields to a JSON array string
    const fields: Record<string, string> = {};
    for (const [key, values] of Object.entries(rawFields)) {
      fields[key] = values.length === 1 ? values[0]! : JSON.stringify(values);
    }

    return { fields, uploadedUrls };
  }

  private async handleFilePart(
    part: MultipartFile,
    fileFields: MultipartFileFieldMap,
    uploadedUrls: MultipartUploadedUrls,
    options?: ParseAndValidateOptions,
  ): Promise<void> {
    const folder = this.resolveFileFolder(part.fieldname, fileFields, options);

    if (!folder) {
      part.file.resume();
      throw new BadRequestException(`Unexpected file field "${part.fieldname}"`);
    }

    const storageKey = this.resolveStorageKey(part.fieldname, uploadedUrls, options);

    // Empty file part with no filename is treated as a clear, not an upload.
    if (!part.filename || part.filename.trim() === '') {
      part.file.resume();
      uploadedUrls[storageKey] = null;
      return;
    }

    let uploadStream: Readable = part.file;
    if (folder === UploadFolder.BLOG_IMAGES && part.mimetype.startsWith('image/')) {
      const buffer = await this.streamToBuffer(part.file);
      validateBlogFeaturedImageBuffer(buffer);
      uploadStream = Readable.from(buffer);
    }

    const result = await this.storageService.uploadImage({
      stream: uploadStream,
      mimetype: part.mimetype,
      originalFilename: part.filename,
      folder,
    });

    uploadedUrls[storageKey] = result.path;
  }

  /** Validate an already-parsed JSON body (same rules as multipart text fields). */
  async validateBody<T extends object>(
    dtoClass: ClassConstructor<T>,
    body: unknown,
  ): Promise<T> {
    if (body === null || body === undefined || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return this.validateDto(dtoClass, body as Record<string, unknown>);
  }

  private async validateDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    fields: Record<string, unknown>,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, fields, {
      // Must stay false: string "false" from form-data is truthy with implicit boolean conversion.
      enableImplicitConversion: false,
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = formatValidationErrorMessage(errors);
      this.logger.warn(`DTO validation failed: ${formatValidationErrorsForLog(errors)}`);
      if (message.includes('name should not be empty') || message.includes('name must be a string')) {
        throw new BadRequestException(
          `${message}. Send "name" as a form-data text field, or include it in a JSON "data" field.`,
        );
      }
      throw new BadRequestException(message);
    }

    return instance;
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
