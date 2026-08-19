import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { existsSync } from 'fs';
import { isAbsolute, join } from 'path';
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
export class GcsStorageProvider implements IStorageProviderWithAccessibleUrl {
  private readonly logger = new Logger(GcsStorageProvider.name);
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    const credentialsPath = this.resolveCredentialsPath(
      this.configService.getOrThrow<string>('storage.gcs.credentialsPath'),
    );

    if (!existsSync(credentialsPath)) {
      throw new Error(
        `GCS credentials file not found at "${credentialsPath}". Set GCS_CREDENTIALS_PATH to your service account JSON path.`,
      );
    }

    this.bucketName = this.configService.getOrThrow<string>('storage.gcs.bucket');
    this.signedUrlTtlSeconds = this.configService.get<number>('storage.gcs.signedUrlTtlSeconds') ?? 3600;

    this.storage = new Storage({ keyFilename: credentialsPath });
    this.logger.log(
      `GCS storage initialized for bucket "${this.bucketName}" (signed URLs, ${this.signedUrlTtlSeconds}s TTL)`,
    );
  }

  async upload(input: IUploadFileInput): Promise<IUploadFileResult> {
    const extension = resolveUploadExtension(input.mimetype, input.originalFilename);
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `${input.folder}/${filename}`;
    const file = this.storage.bucket(this.bucketName).file(relativePath);

    await pipeline(
      input.stream,
      file.createWriteStream({
        metadata: { contentType: input.mimetype },
        resumable: false,
      }),
    );

    const [metadata] = await file.getMetadata();

    return {
      path: relativePath,
      url: '',
      filename,
      mimetype: input.mimetype,
      size: Number(metadata.size ?? 0),
    };
  }

  async uploadAtPath(input: IUploadAtPathInput): Promise<IUploadFileResult> {
    const relativePath = this.normalizeKey(input.relativePath);
    const file = this.storage.bucket(this.bucketName).file(relativePath);

    await pipeline(
      input.stream,
      file.createWriteStream({
        metadata: {
          contentType: input.mimetype,
          cacheControl: 'private, max-age=0, no-transform',
        },
        resumable: false,
      }),
    );

    const [metadata] = await file.getMetadata();
    const filename = relativePath.split('/').pop() ?? relativePath;

    return {
      path: relativePath,
      url: '',
      filename,
      mimetype: input.mimetype,
      size: Number(metadata.size ?? 0),
    };
  }

  async exists(relativePath: string): Promise<boolean> {
    const [exists] = await this.storage
      .bucket(this.bucketName)
      .file(this.normalizeKey(relativePath))
      .exists();
    return exists;
  }

  async list(prefix: string): Promise<string[]> {
    const normalized = this.normalizeKey(prefix);
    const [files] = await this.storage.bucket(this.bucketName).getFiles({
      prefix: normalized,
    });
    return files
      .map((file) => file.name)
      .filter((name) => Boolean(name) && !name.endsWith('/'));
  }

  async copy(fromRelativePath: string, toRelativePath: string): Promise<void> {
    const source = this.storage.bucket(this.bucketName).file(this.normalizeKey(fromRelativePath));
    const destination = this.storage.bucket(this.bucketName).file(this.normalizeKey(toRelativePath));
    await source.copy(destination);
  }

  async getAccessibleUrl(relativePath: string): Promise<string> {
    const [signedUrl] = await this.storage
      .bucket(this.bucketName)
      .file(relativePath)
      .getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: Date.now() + this.signedUrlTtlSeconds * 1000,
      });

    return signedUrl;
  }

  async delete(relativePath: string): Promise<void> {
    await this.storage
      .bucket(this.bucketName)
      .file(relativePath)
      .delete({ ignoreNotFound: true });
  }

  async createReadStream(relativePath: string): Promise<Readable> {
    return this.storage.bucket(this.bucketName).file(this.normalizeKey(relativePath)).createReadStream();
  }

  private resolveCredentialsPath(pathValue: string): string {
    return isAbsolute(pathValue) ? pathValue : join(process.cwd(), pathValue);
  }

  private normalizeKey(relativePath: string): string {
    return relativePath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  }
}
