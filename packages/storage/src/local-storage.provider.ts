import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, createReadStream } from 'fs';
import { access, copyFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import {
  IUploadAtPathInput,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';
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

  async uploadAtPath(input: IUploadAtPathInput): Promise<IUploadFileResult> {
    const relativePath = this.toPosixKey(input.relativePath);
    const absolutePath = join(this.uploadDir, ...relativePath.split('/'));
    await mkdir(dirname(absolutePath), { recursive: true });
    await pipeline(input.stream, createWriteStream(absolutePath));
    const fileStat = await stat(absolutePath);
    const filename = relativePath.split('/').pop() ?? relativePath;

    return {
      path: relativePath,
      url: await this.getAccessibleUrl(relativePath),
      filename,
      mimetype: input.mimetype,
      size: fileStat.size,
    };
  }

  async exists(relativePath: string): Promise<boolean> {
    const absolutePath = join(this.uploadDir, ...this.toPosixKey(relativePath).split('/'));
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async list(prefix: string): Promise<string[]> {
    const normalized = this.toPosixKey(prefix);
    const startDir = join(this.uploadDir, ...normalized.split('/').filter(Boolean));
    const results: string[] = [];
    await this.walkFiles(startDir, (absolutePath) => {
      const posix = this.toPosixKey(relative(this.uploadDir, absolutePath));
      if (posix.startsWith(normalized)) {
        results.push(posix);
      }
    });
    return results;
  }

  async copy(fromRelativePath: string, toRelativePath: string): Promise<void> {
    const fromAbs = join(this.uploadDir, ...this.toPosixKey(fromRelativePath).split('/'));
    const toAbs = join(this.uploadDir, ...this.toPosixKey(toRelativePath).split('/'));
    await mkdir(dirname(toAbs), { recursive: true });
    await copyFile(fromAbs, toAbs);
  }

  async getAccessibleUrl(relativePath: string): Promise<string> {
    return `/uploads/${relativePath.replace(/^\/+/, '')}`;
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = join(this.uploadDir, ...this.toPosixKey(relativePath).split('/'));
    try {
      await unlink(absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async createReadStream(relativePath: string): Promise<Readable> {
    const absolutePath = join(this.uploadDir, ...this.toPosixKey(relativePath).split('/'));
    return createReadStream(absolutePath);
  }

  private toPosixKey(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  }

  private async walkFiles(
    dir: string,
    onFile: (absolutePath: string) => void,
  ): Promise<void> {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walkFiles(absolutePath, onFile);
      } else if (entry.isFile()) {
        onFile(absolutePath);
      }
    }
  }
}
