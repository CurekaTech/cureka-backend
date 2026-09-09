import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { formatValidationErrorMessage, formatValidationErrorsForLog } from '@packages/common';
import { StorageService } from '@packages/storage';
import type { IStorageFileReference } from '@packages/storage';
import { UploadFolder } from '@modules/uploads/enums/upload-folder.enum';
import { CreateProductDto, UpdateProductDto } from '../dto/product.dto';
import { ProductType } from '../enums/product-type.enum';
import { ensureBundleSkuInPayload, ensureVariantSkusInPayload } from '../utils/bundle-product.util';
import { mergeUploadedProductMedia, ProductUploadedFiles } from '../utils/product-media.util';

const PRODUCT_IMAGE_FIELDS = new Set(['images', 'image', 'images[]']);
const SIZE_CHART_FIELDS = new Set(['sizeChart', 'size_chart']);
const BUNDLE_ICON_FIELDS = new Set(['bundleIcon', 'bundle_icon']);
const VARIANT_IMAGE_PREFIX = 'variantImages_';
const CLIENT_ONLY_FIELDS = new Set(['refId']);

@Injectable()
export class ProductMultipartService {
  private readonly logger = new Logger(ProductMultipartService.name);

  constructor(private readonly storageService: StorageService) {}

  async parseCreateProduct(
    req: FastifyRequest,
    defaults?: Record<string, unknown>,
  ): Promise<CreateProductDto> {
    const { parsed, uploads } = await this.parseMultipartPayload(req);
    return this.validateAndNormalizeCreateProduct(
      { ...parsed, ...defaults },
      uploads,
    );
  }

  async parseUpdateProduct(
    req: FastifyRequest,
    defaults?: Record<string, unknown>,
  ): Promise<UpdateProductDto> {
    const { parsed, uploads } = await this.parseMultipartPayload(req);
    return this.validateAndNormalizeUpdateProduct(
      { ...parsed, ...defaults },
      uploads,
    );
  }

  async validateJsonBody(
    body: unknown,
    defaults?: Record<string, unknown>,
  ): Promise<CreateProductDto> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return this.validateAndNormalizeCreateProduct({
      ...(body as Record<string, unknown>),
      ...defaults,
    });
  }

  async validateUpdateJsonBody(
    body: unknown,
    defaults?: Record<string, unknown>,
  ): Promise<UpdateProductDto> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be a JSON object');
    }
    return this.validateAndNormalizeUpdateProduct({
      ...(body as Record<string, unknown>),
      ...defaults,
    });
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
      sizeChart: undefined,
      bundleIcon: undefined,
    };

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (PRODUCT_IMAGE_FIELDS.has(part.fieldname)) {
          uploads.productImages.push(await this.uploadImagePart(part, UploadFolder.IMAGES));
          continue;
        }
        if (SIZE_CHART_FIELDS.has(part.fieldname)) {
          uploads.sizeChart = await this.uploadImagePart(part, UploadFolder.IMAGES);
          continue;
        }
        if (BUNDLE_ICON_FIELDS.has(part.fieldname)) {
          uploads.bundleIcon = await this.uploadImagePart(part, UploadFolder.ICONS);
          continue;
        }

        const variantSku = this.parseVariantImageField(part.fieldname);
        if (variantSku) {
          (uploads.variantImages[variantSku] ??= []).push(
            await this.uploadImagePart(part, UploadFolder.IMAGES),
          );
          continue;
        }

        part.file.resume();
        throw new BadRequestException(
          `Unexpected file field "${part.fieldname}". Use "images" for product photos, "variantImages_<sku>" for variant photos, "sizeChart" for size chart, or "bundleIcon" for bundle icon.`,
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

  private normalizeFileRefInPayload(
    payload: Record<string, unknown>,
    field: 'sizeChart' | 'bundleIcon',
  ): Record<string, unknown> {
    if (!(field in payload)) return payload;

    const value = payload[field];
    if (value === undefined) return payload;
    if (value === null) return payload;

    if (typeof value === 'string') {
      return { ...payload, [field]: this.storageService.toFileReference(value) };
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.key === 'string') {
        return {
          ...payload,
          [field]: this.storageService.toFileReferenceValue(value as IStorageFileReference),
        };
      }
      if (typeof record.url === 'string') {
        return { ...payload, [field]: this.storageService.toFileReference(record.url) };
      }
    }

    return payload;
  }

  private applyUploadedFileRefs<T extends CreateProductDto | UpdateProductDto>(
    dto: T,
    uploads?: ProductUploadedFiles,
  ): T {
    let merged: T = dto;
    if (uploads?.sizeChart) {
      merged = {
        ...merged,
        sizeChart: this.storageService.toFileReference(uploads.sizeChart),
      };
    }
    if (uploads?.bundleIcon) {
      merged = {
        ...merged,
        bundleIcon: this.storageService.toFileReference(uploads.bundleIcon),
      };
    }
    return merged;
  }

  private async validateAndNormalizeCreateProduct(
    payload: Record<string, unknown>,
    uploads?: ProductUploadedFiles,
  ): Promise<CreateProductDto> {
    let prepared = this.normalizeFileRefInPayload(
      this.normalizeFileRefInPayload(this.stripClientOnlyFields(payload), 'sizeChart'),
      'bundleIcon',
    );
    prepared = ensureVariantSkusInPayload(prepared);
    if (prepared.productType === ProductType.BUNDLE) {
      prepared = ensureBundleSkuInPayload(prepared);
    }
    const mergedBase = uploads
      ? mergeUploadedProductMedia(prepared as unknown as CreateProductDto, uploads)
      : (prepared as unknown as CreateProductDto);
    const merged = this.applyUploadedFileRefs(mergedBase, uploads);

    return this.validateDto(CreateProductDto, merged, 'CreateProductDto');
  }

  private async validateAndNormalizeUpdateProduct(
    payload: Record<string, unknown>,
    uploads?: ProductUploadedFiles,
  ): Promise<UpdateProductDto> {
    let prepared = this.normalizeFileRefInPayload(
      this.normalizeFileRefInPayload(this.stripClientOnlyFields(payload), 'sizeChart'),
      'bundleIcon',
    );
    if (prepared.productType === ProductType.BUNDLE) {
      // Only fill SKU when creating/replacing pricing via top-level sku or variants[];
      // leave omitted so existing variant SKU is preserved on partial updates.
      const hasPricingVariantInput =
        prepared.sku !== undefined ||
        (Array.isArray(prepared.variants) && prepared.variants.length > 0);
      if (hasPricingVariantInput) {
        prepared = ensureBundleSkuInPayload(prepared);
      }
    }
    const mergedBase = uploads
      ? mergeUploadedProductMedia(prepared as unknown as CreateProductDto, uploads)
      : (prepared as unknown as UpdateProductDto);
    const merged = this.applyUploadedFileRefs(mergedBase, uploads);

    return this.validateDto(UpdateProductDto, merged, 'UpdateProductDto');
  }

  private stripClientOnlyFields(payload: Record<string, unknown>): Record<string, unknown> {
    const next = { ...payload };
    for (const field of CLIENT_ONLY_FIELDS) {
      delete next[field];
    }
    return next;
  }

  private async uploadImagePart(part: MultipartFile, folder: UploadFolder): Promise<string> {
    try {
      const result = await this.storageService.uploadImage({
        stream: part.file,
        mimetype: part.mimetype,
        originalFilename: part.filename,
        folder,
      });
      return result.path;
    } catch (error) {
      const filename = part.filename || part.fieldname;
      if (error instanceof BadRequestException) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : 'Unknown upload error';
      this.logger.error(`Upload failed for "${filename}": ${detail}`, error instanceof Error ? error.stack : undefined);
      throw new BadRequestException(`Failed to upload "${filename}": ${detail}`);
    }
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
