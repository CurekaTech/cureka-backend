import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IStorageProvider,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';
import { ALLOWED_IMAGE_MIME_TYPES, STORAGE_PROVIDER } from './storage.constants';

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

  async delete(relativePath: string): Promise<void> {
    if (!relativePath || relativePath.includes('..')) {
      throw new BadRequestException('Invalid file path');
    }
    await this.provider.delete(relativePath);
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
