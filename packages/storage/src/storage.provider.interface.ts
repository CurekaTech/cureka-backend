import { Readable } from 'stream';

export interface IUploadFileInput {
  stream: Readable;
  mimetype: string;
  originalFilename: string;
  folder: string;
  /** Override the configured max file size for this specific upload (bytes). */
  maxSizeOverride?: number;
}

export interface IUploadFileResult {
  path: string;
  url: string;
  filename: string;
  mimetype: string;
  size: number;
}

export interface IUploadAtPathInput {
  relativePath: string;
  stream: Readable;
  mimetype: string;
}

export interface IStorageProvider {
  upload(input: IUploadFileInput): Promise<IUploadFileResult>;
  /** Write to an exact object key (no UUID rename). Used for generated files such as sitemaps. */
  uploadAtPath(input: IUploadAtPathInput): Promise<IUploadFileResult>;
  exists(relativePath: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  copy(fromRelativePath: string, toRelativePath: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  createReadStream(relativePath: string): Promise<Readable>;
}
