import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { mkdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { IUploadFileInput, IUploadFileResult } from './storage.provider.interface';
import { IStorageProviderWithAccessibleUrl } from './storage-accessible-url.interface';
import { resolveUploadExtension } from './mime-extension.util';

@Injectable()
export class LocalStorageProvider implements IStorageProviderWithAccessibleUrl {
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.getOrThrow<string>('storage.uploadDir');
  }

  async upload(input: IUploadFileInput): Promise<IUploadFileResult> {
    const extension = resolveUploadExtension(input.mimetype, input.originalFilename);
    const filename = `${randomUUID()}${extension}`;
    const folderDir = join(this.uploadDir, input.folder);
    const absolutePath = join(folderDir, filename);
    const relativePath = `${input.folder}/${filename}`;

    await mkdir(folderDir, { recursive: true });

    await pipeline(input.stream, createWriteStream(absolutePath));

    const fileStat = await stat(absolutePath);
    const accessibleUrl = await this.getAccessibleUrl(relativePath);

    return {
      path: relativePath,
      url: accessibleUrl,
      filename,
      mimetype: input.mimetype,
      size: fileStat.size,
    };
  }

  async getAccessibleUrl(relativePath: string): Promise<string> {
    return `/uploads/${relativePath.replace(/^\/+/, '')}`;
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = join(this.uploadDir, relativePath);
    await unlink(absolutePath);
  }
}
