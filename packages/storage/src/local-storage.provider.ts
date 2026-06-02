import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { extname, join } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import {
  IStorageProvider,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

@Injectable()
export class LocalStorageProvider implements IStorageProvider {
  private readonly uploadDir: string;

  constructor(private readonly configService: ConfigService) {
    this.uploadDir = this.configService.getOrThrow<string>('storage.uploadDir');
  }

  async upload(input: IUploadFileInput): Promise<IUploadFileResult> {
    const extension = this.resolveExtension(input.mimetype, input.originalFilename);
    const filename = `${randomUUID()}${extension}`;
    const folderDir = join(this.uploadDir, input.folder);
    const absolutePath = join(folderDir, filename);
    const relativePath = `${input.folder}/${filename}`;

    await mkdir(folderDir, { recursive: true });

    await pipeline(input.stream, createWriteStream(absolutePath));

    const fileStat = await stat(absolutePath);

    return {
      path: relativePath,
      url: `/uploads/${relativePath}`,
      filename,
      mimetype: input.mimetype,
      size: fileStat.size,
    };
  }

  async delete(relativePath: string): Promise<void> {
    const { unlink } = await import('fs/promises');
    const absolutePath = join(this.uploadDir, relativePath);
    await unlink(absolutePath);
  }

  private resolveExtension(mimetype: string, originalFilename: string): string {
    const fromMime = MIME_TO_EXTENSION[mimetype];
    if (fromMime) return fromMime;

    const fromName = extname(originalFilename).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
      return fromName === '.jpeg' ? '.jpg' : fromName;
    }

    return '.bin';
  }
}
