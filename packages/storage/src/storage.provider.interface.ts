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

export interface IStorageProvider {
  upload(input: IUploadFileInput): Promise<IUploadFileResult>;
  delete(relativePath: string): Promise<void>;
  createReadStream(relativePath: string): Promise<Readable>;
}
