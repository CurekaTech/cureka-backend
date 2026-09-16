import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import {
  IStorageProvider,
  IUploadAtPathInput,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  IStorageUploadHook,
  STORAGE_PROVIDER,
  STORAGE_UPLOAD_HOOK,
} from './storage.constants';
import { limitUploadStreamSize, resolveMaxFileSizeForMime, UploadSizeLimitExceededError } from './upload-size.util';
import { normalizeStorageKey } from './storage-path.util';
import { IStorageFileReference, IStorageFileReferenceResponse } from './storage-file-reference.interface';
import {
  hasAccessibleUrlSupport,
  IStorageProviderWithAccessibleUrl,
} from './storage-accessible-url.interface';

@Injectable()
export class StorageService {
  private readonly accessibleUrlCache = new Map<string, { url: string; expiresAt: number }>();
  private readonly inFlightAccessibleUrls = new Map<string, Promise<string | null>>();

  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: IStorageProvider,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async uploadImage(input: IUploadFileInput): Promise<IUploadFileResult> {
    this.assertAllowedMimeType(input.mimetype);
    const configuredMax = resolveMaxFileSizeForMime(input.mimetype, {
      maxImageFileSize: this.configService.get<number>('storage.maxImageFileSize'),
      maxVideoFileSize: this.configService.get<number>('storage.maxVideoFileSize'),
      maxBulkFileSize: this.configService.get<number>('storage.maxBulkFileSize'),
    });
    const maxBytes = input.maxSizeOverride ?? configuredMax;
    const stream = limitUploadStreamSize(input.stream, maxBytes, input.mimetype);

    try {
      const result = await this.provider.upload({ ...input, stream });
      await this.notifyUploadHook(result.path, result.mimetype, result.size);
      return result;
    } catch (error) {
      if (error instanceof UploadSizeLimitExceededError) {
        throw new BadRequestException(error.message);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof Error) {
        throw new BadRequestException(`File upload failed: ${error.message}`);
      }
      throw error;
    }
  }

  /** Persist only the object key in the database. */
  normalizeStorageKey(stored: string | null | undefined): string | null {
    return normalizeStorageKey(stored);
  }

  /** Bucket name for GCS, or "local" when using the filesystem driver. */
  getBucketName(): string {
    const driver = this.configService.get<string>('storage.driver') ?? 'local';
    if (driver === 'gcs') {
      return this.configService.getOrThrow<string>('storage.gcs.bucket');
    }
    return 'local';
  }

  /** Map an upload path or legacy string to `{ key, name }`. */
  toFileReference(stored: string | null | undefined): IStorageFileReference | null {
    const key = normalizeStorageKey(stored);
    if (!key) return null;
    return { key, name: this.getBucketName() };
  }

  toFileReferenceValue(
    stored: string | IStorageFileReference | null | undefined,
  ): IStorageFileReference | null {
    if (!stored) return null;

    if (typeof stored === 'object' && typeof stored.key === 'string') {
      const key = normalizeStorageKey(stored.key);
      if (!key) return null;
      const name =
        typeof stored.name === 'string' && stored.name.trim()
          ? stored.name
          : this.getBucketName();
      return { key, name };
    }

    if (typeof stored === 'string') {
      return this.toFileReference(stored);
    }

    return null;
  }

  private wasAlreadyEnriched(
    stored: string | IStorageFileReference | null | undefined,
  ): boolean {
    return (
      typeof stored === 'object' &&
      stored !== null &&
      'url' in stored &&
      typeof stored.url === 'string' &&
      stored.url.length > 0
    );
  }

  /** Normalize input to `{ key, name }` before persisting to the database. */
  persistFileReference(
    stored: string | IStorageFileReference | null | undefined,
  ): IStorageFileReference | null {
    return this.toFileReferenceValue(stored);
  }

  /** Map stored values to `{ key, name, url }` for API responses. */
  async toFileReferenceResponses(
    stored: Array<string | IStorageFileReference | null | undefined>,
  ): Promise<Array<IStorageFileReferenceResponse | null>> {
    return Promise.all(stored.map((value) => this.toFileReferenceResponse(value)));
  }

  /** Map a stored value to `{ key, name, url }` for API responses. */
  async toFileReferenceResponse(
    stored: string | IStorageFileReference | null | undefined,
  ): Promise<IStorageFileReferenceResponse | null> {
    const reference = this.toFileReferenceValue(stored);
    if (!reference) return null;

    const url = await this.resolveAccessibleUrl(reference, {
      forceRefresh: this.wasAlreadyEnriched(stored),
    });
    if (!url) return null;

    return { ...reference, url };
  }

  /** Issue a fresh browser-accessible URL (signed for GCS, /uploads for local). */
  async resolveAccessibleUrl(
    stored: string | IStorageFileReference | null | undefined,
    options?: { forceRefresh?: boolean },
  ): Promise<string | null> {
    const key =
      typeof stored === 'object' && stored !== null && typeof stored.key === 'string'
        ? normalizeStorageKey(stored.key)
        : normalizeStorageKey(typeof stored === 'string' ? stored : null);
    if (!key) return null;

    if (!options?.forceRefresh) {
      const cached = this.accessibleUrlCache.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.url;
      }
    }

    const inFlight = this.inFlightAccessibleUrls.get(key);
    if (inFlight) {
      return inFlight;
    }

    const resolution = this.resolveAccessibleUrlUncached(key);
    this.inFlightAccessibleUrls.set(key, resolution);

    try {
      return await resolution;
    } finally {
      this.inFlightAccessibleUrls.delete(key);
    }
  }

  private async resolveAccessibleUrlUncached(key: string): Promise<string | null> {
    if (!hasAccessibleUrlSupport(this.provider)) {
      return key;
    }

    const provider = this.provider as IStorageProviderWithAccessibleUrl;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = await provider.getAccessibleUrl(key);
        const ttlMs = this.getAccessibleUrlCacheTtlMs();
        if (ttlMs > 0) {
          this.accessibleUrlCache.set(key, { url, expiresAt: Date.now() + ttlMs });
        }

        return url;
      } catch {
        if (attempt === 1) {
          return null;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return null;
  }

  async delete(relativePath: string): Promise<void> {
    const key = this.assertSafeKey(relativePath);
    await this.provider.delete(key);
  }

  async createReadStream(relativePath: string): Promise<Readable> {
    const key = this.assertSafeKey(relativePath);
    return this.provider.createReadStream(key);
  }

  async uploadAtPath(input: {
    relativePath: string;
    stream: Readable;
    mimetype: string;
    cacheControl?: string;
  }): Promise<IUploadFileResult> {
    const relativePath = this.assertSafeKey(input.relativePath);
    const payload: IUploadAtPathInput = {
      relativePath,
      stream: input.stream,
      mimetype: input.mimetype,
      cacheControl: input.cacheControl,
    };
    const result = await this.provider.uploadAtPath(payload);
    await this.notifyUploadHook(result.path, result.mimetype, result.size);
    return result;
  }

  /**
   * Read an object into memory with a hard byte cap. Used by image processing,
   * never by public GET handlers.
   */
  async readObjectBuffer(relativePath: string, maxBytes: number): Promise<Buffer> {
    const key = this.assertSafeKey(relativePath);
    const stream = await this.provider.createReadStream(key);
    const chunks: Buffer[] = [];
    let bytes = 0;

    try {
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > maxBytes) {
          stream.destroy();
          throw new BadRequestException(
            `Object exceeds maximum readable size of ${maxBytes} bytes`,
          );
        }
        chunks.push(buffer);
      }
    } catch (error) {
      stream.destroy();
      throw error;
    }

    return Buffer.concat(chunks, bytes);
  }

  async exists(relativePath: string): Promise<boolean> {
    const key = this.assertSafeKey(relativePath);
    return this.provider.exists(key);
  }

  async list(prefix: string): Promise<string[]> {
    const key = this.assertSafeKey(prefix);
    return this.provider.list(key);
  }

  async copy(fromRelativePath: string, toRelativePath: string): Promise<void> {
    const from = this.assertSafeKey(fromRelativePath);
    const to = this.assertSafeKey(toRelativePath);
    await this.provider.copy(from, to);
  }

  private assertSafeKey(relativePath: string): string {
    const key = normalizeStorageKey(relativePath);
    if (!key || key.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }
    return key;
  }

  private assertAllowedMimeType(mimetype: string): void {
    const allowed = this.configService.get<string[]>('storage.allowedMimeTypes')
      ?? [...ALLOWED_UPLOAD_MIME_TYPES];

    if (allowed.includes(mimetype) || mimetype.startsWith('video/')) {
      return;
    }

    throw new BadRequestException(
      `Unsupported file type "${mimetype}". Allowed: ${allowed.join(', ')}`,
    );
  }

  private async notifyUploadHook(key: string, mimetype: string, size: number): Promise<void> {
    let hook: IStorageUploadHook | undefined;
    try {
      hook = this.moduleRef.get<IStorageUploadHook>(STORAGE_UPLOAD_HOOK, { strict: false });
    } catch {
      return;
    }
    if (!hook) return;
    try {
      await hook.onStoredObject({ key, mimetype, size });
    } catch {
      // Upload already succeeded; pending-row reconciliation covers hook failures.
    }
  }

  private getAccessibleUrlCacheTtlMs(): number {
    const driver = this.configService.get<string>('storage.driver') ?? 'local';
    if (driver !== 'gcs') return 0;

    const signedUrlTtlSeconds =
      this.configService.get<number>('storage.gcs.signedUrlTtlSeconds') ?? 86400;
    // Refresh 5 minutes before the signed URL expires so clients always receive
    // URLs with meaningful remaining validity (not just seconds).
    const bufferMs = 5 * 60 * 1000;
    return Math.max(bufferMs, signedUrlTtlSeconds * 1000 - bufferMs);
  }
}
