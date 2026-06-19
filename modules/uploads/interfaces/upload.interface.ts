import { IStorageFileReferenceResponse } from '@packages/storage';

export interface IUploadedFileResponse {
  path: string;
  url: string;
  file: IStorageFileReferenceResponse;
  filename: string;
  mimetype: string;
  size: number;
  folder: string;
}
