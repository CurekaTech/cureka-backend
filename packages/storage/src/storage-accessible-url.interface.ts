import {
  IStorageProvider,
  IUploadFileInput,
  IUploadFileResult,
} from './storage.provider.interface';

export interface IStorageProviderWithAccessibleUrl extends IStorageProvider {
  getAccessibleUrl(relativePath: string): Promise<string>;
}

export const hasAccessibleUrlSupport = (
  provider: IStorageProvider,
): provider is IStorageProviderWithAccessibleUrl =>
  typeof (provider as IStorageProviderWithAccessibleUrl).getAccessibleUrl === 'function';
