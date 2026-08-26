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

@Injectable()
export class MultipartFormService {
  private readonly logger = new Logger(MultipartFormService.name);

  constructor(private readonly storageService: StorageService) {}

  async parseAndValidate<T extends object>(
    req: FastifyRequest,
    dtoClass: ClassConstructor<T>,
    fileFields: MultipartFileFieldMap,
  ): Promise<{ dto: T; uploadedUrls: Record<string, string> }> {
    const { fields, uploadedUrls } = await this.parseMultipart(req, fileFields);
    const mergedFields = this.sanitizeDtoFields(this.mergeFormFields(fields), fileFields);
    const dto = await this.validateDto(dtoClass, mergedFields);
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
      if (value === undefined || value === null) continue;
      merged[key] =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    return { ...merged, ...rest };
  }

  /**
   * Clients often send file fields as text placeholders (`banner=null`) and empty
   * optional fields. Those are not DTO properties and trip forbidNonWhitelisted.
   * Real uploads are already captured in `uploadedUrls`.
   */
  private sanitizeDtoFields(
    fields: Record<string, string>,
    fileFields: MultipartFileFieldMap,
  ): Record<string, string> {
    const cleaned: Record<string, string> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (key in fileFields) continue;

      const trimmed = value.trim();
      if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') continue;

      cleaned[key] = value;
    }

    return cleaned;
  }

  private async parseMultipart(
    req: FastifyRequest,
    fileFields: MultipartFileFieldMap,
  ): Promise<{ fields: Record<string, string>; uploadedUrls: Record<string, string> }> {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new BadRequestException(
        'Content-Type must be multipart/form-data when uploading logo, banner, or image files.',
      );
    }

    const rawFields: Record<string, string[]> = {};
    const uploadedUrls: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        await this.handleFilePart(part, fileFields, uploadedUrls);
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
      fields[key] = values.length === 1 ? values[0] : JSON.stringify(values);
    }

    return { fields, uploadedUrls };
  }

  private async handleFilePart(
    part: MultipartFile,
    fileFields: MultipartFileFieldMap,
    uploadedUrls: Record<string, string>,
  ): Promise<void> {
    const folder = fileFields[part.fieldname];

    if (!folder) {
      part.file.resume();
      throw new BadRequestException(`Unexpected file field "${part.fieldname}"`);
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

    uploadedUrls[part.fieldname] = result.path;
  }

  private async validateDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    fields: Record<string, string>,
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
