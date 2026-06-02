import { BadRequestException, Injectable } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '../enums/upload-folder.enum';

export type MultipartFileFieldMap = Record<string, UploadFolder>;

@Injectable()
export class MultipartFormService {
  constructor(private readonly storageService: StorageService) {}

  async parseAndValidate<T extends object>(
    req: FastifyRequest,
    dtoClass: ClassConstructor<T>,
    fileFields: MultipartFileFieldMap,
  ): Promise<{ dto: T; uploadedUrls: Record<string, string> }> {
    const { fields, uploadedUrls } = await this.parseMultipart(req, fileFields);
    const mergedFields = this.mergeFormFields(fields);
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

    const fields: Record<string, string> = {};
    const uploadedUrls: Record<string, string> = {};

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        await this.handleFilePart(part, fileFields, uploadedUrls);
      } else {
        fields[part.fieldname] = part.value as string;
      }
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

    const result = await this.storageService.uploadImage({
      stream: part.file,
      mimetype: part.mimetype,
      originalFilename: part.filename,
      folder,
    });

    uploadedUrls[part.fieldname] = result.url;
  }

  private async validateDto<T extends object>(
    dtoClass: ClassConstructor<T>,
    fields: Record<string, string>,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, fields, {
      enableImplicitConversion: true,
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      const message = this.formatValidationErrors(errors);
      if (message.includes('name should not be empty') || message.includes('name must be a string')) {
        throw new BadRequestException(
          `${message}. Send "name" as a form-data text field, or include it in a JSON "data" field.`,
        );
      }
      throw new BadRequestException(message);
    }

    return instance;
  }

  private formatValidationErrors(errors: ValidationError[]): string {
    const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
    return messages.join('; ') || 'Validation failed';
  }
}
