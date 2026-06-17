import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStorageProvider,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';
import { ALLOWED_IMAGE_MIME_TYPES, STORAGE_PROVIDER } from './storage.constants';
import { normalizeStorageKey } from './storage-path.util';
import {
  hasAccessibleUrlSupport,
  IStorageProviderWithAccessibleUrl,
} from './storage-accessible-url.interface';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly provider: IStorageProvider,
    private readonly configService: ConfigService,
  ) {}

  async uploadImage(input: IUploadFileInput): Promise<IUploadFileResult> {
    this.assertAllowedMimeType(input.mimetype);
    return this.provider.upload(input);
  }

  /** Persist only the object key in the database. */
  normalizeStorageKey(stored: string | null | undefined): string | null {
    return normalizeStorageKey(stored);
  }

  /** Issue a fresh browser-accessible URL (signed for GCS, /uploads for local). */
  async resolveAccessibleUrl(stored: string | null | undefined): Promise<string | null> {
    const key = normalizeStorageKey(stored);
    if (!key) return null;

    if (!hasAccessibleUrlSupport(this.provider)) {
      return stored ?? null;
    }

    return (this.provider as IStorageProviderWithAccessibleUrl).getAccessibleUrl(key);
  }

  async delete(relativePath: string): Promise<void> {
    const key = normalizeStorageKey(relativePath);
    if (!key || key.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }
    await this.provider.delete(key);
  }

  private assertAllowedMimeType(mimetype: string): void {
    const allowed = this.configService.get<string[]>('storage.allowedMimeTypes')
      ?? [...ALLOWED_IMAGE_MIME_TYPES];

    if (!allowed.includes(mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${mimetype}". Allowed: ${allowed.join(', ')}`,
      );
    }
  }
}
