import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { formatValidationErrorMessage, formatValidationErrorsForLog } from '@packages/common';
import { StorageService } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { mergeUploadedProductMedia, ProductUploadedFiles } from '../utils/product-media.util';

const PRODUCT_IMAGE_FIELDS = new Set(['images', 'image', 'images[]']);
const VARIANT_IMAGE_PREFIX = 'variantImages_';
const CLIENT_ONLY_FIELDS = new Set(['refId']);

@Injectable()
export class ProductMultipartService {
  private readonly logger = new Logger(ProductMultipartService.name);

  constructor(private readonly storageService: StorageService) {}

  async parseCreateProduct(req: FastifyRequest): Promise<CreateProductDto> {
    const { parsed, uploads } = await this.parseMultipartPayload(req);
    return this.validateAndNormalizeCreateProduct(parsed, uploads);
  }

  async parseUpdateProduct(req: FastifyRequest): Promise<UpdateProductDto> {
    const { parsed, uploads } = await this.parseMultipartPayload(req);
    return this.validateAndNormalizeUpdateProduct(parsed, uploads);
  }

  async validateJsonBody(body: unknown): Promise<CreateProductDto> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return this.validateAndNormalizeCreateProduct(body as Record<string, unknown>);
  }

  async validateUpdateJsonBody(body: unknown): Promise<UpdateProductDto> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return this.validateAndNormalizeUpdateProduct(body as Record<string, unknown>);
  }

  private async parseMultipartPayload(req: FastifyRequest): Promise<{
    parsed: Record<string, unknown>;
    uploads: ProductUploadedFiles;
  }> {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new BadRequestException(
        'Content-Type must be multipart/form-data. Send a JSON "data" field plus image file fields.',
      );
    }

    let dataJson: string | null = null;
    const extraFields: Record<string, string[]> = {};
    const uploads: ProductUploadedFiles = {
      productImages: [],
      variantImages: {},
    };

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const path = await this.uploadImagePart(part);
        if (PRODUCT_IMAGE_FIELDS.has(part.fieldname)) {
          uploads.productImages.push(path);
          continue;
        }

        const variantSku = this.parseVariantImageField(part.fieldname);
        if (variantSku) {
          (uploads.variantImages[variantSku] ??= []).push(path);
          continue;
        }

        part.file.resume();
        throw new BadRequestException(
          `Unexpected file field "${part.fieldname}". Use "images" for product photos or "variantImages_<sku>" for variant photos.`,
        );
      }

      if (part.fieldname === 'data') {
        dataJson = part.value as string;
        continue;
      }

      (extraFields[part.fieldname] ??= []).push(part.value as string);
    }

    if (!dataJson) {
      throw new BadRequestException(
        'Form field "data" is required. Send the product payload as JSON in a "data" field alongside image files.',
      );
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataJson) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Invalid JSON in form field "data"');
    }

    for (const [key, values] of Object.entries(extraFields)) {
      if (values.length === 1) {
        parsed[key] = values[0];
      }
    }

    return { parsed, uploads };
  }

  private async validateAndNormalizeCreateProduct(
    payload: Record<string, unknown>,
    uploads?: ProductUploadedFiles,
  ): Promise<CreateProductDto> {
    const sanitized = this.stripClientOnlyFields(payload);
    const merged = uploads
      ? mergeUploadedProductMedia(sanitized as unknown as CreateProductDto, uploads)
      : (sanitized as unknown as CreateProductDto);

    return this.validateDto(CreateProductDto, merged, 'CreateProductDto');
  }

  private async validateAndNormalizeUpdateProduct(
    payload: Record<string, unknown>,
    uploads?: ProductUploadedFiles,
  ): Promise<UpdateProductDto> {
    const sanitized = this.stripClientOnlyFields(payload);
    const merged = uploads
      ? mergeUploadedProductMedia(sanitized as unknown as CreateProductDto, uploads)
      : (sanitized as unknown as UpdateProductDto);

    return this.validateDto(UpdateProductDto, merged, 'UpdateProductDto');
  }

  private stripClientOnlyFields(payload: Record<string, unknown>): Record<string, unknown> {
    const next = { ...payload };
    for (const field of CLIENT_ONLY_FIELDS) {
      delete next[field];
    }
    return next;
  }

  private async uploadImagePart(part: MultipartFile): Promise<string> {
    const result = await this.storageService.uploadImage({
      stream: part.file,
      mimetype: part.mimetype,
      originalFilename: part.filename,
      folder: UploadFolder.IMAGES,
    });
    return result.path;
  }

  private parseVariantImageField(fieldname: string): string | null {
    if (fieldname.startsWith(VARIANT_IMAGE_PREFIX)) {
      const sku = fieldname.slice(VARIANT_IMAGE_PREFIX.length).trim();
      return sku || null;
    }

    const bracketMatch = fieldname.match(/^variantImages\[(.+)\]$/);
    return bracketMatch?.[1]?.trim() || null;
  }

  private async validateDto<T extends object>(
    dtoClass: new () => T,
    payload: T,
    label: string,
  ): Promise<T> {
    const instance = plainToInstance(dtoClass, payload, {
      enableImplicitConversion: false,
    });

    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });

    if (errors.length > 0) {
      this.logger.warn(`${label} validation failed: ${formatValidationErrorsForLog(errors)}`);
      throw new BadRequestException(formatValidationErrorMessage(errors));
    }

    return instance;
  }
}
