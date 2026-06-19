/** Persisted storage reference: object key + bucket name. */
export interface IStorageFileReference {
  key: string;
  name: string;
}

/** API response shape: persisted reference plus a browser-accessible URL. */
export interface IStorageFileReferenceResponse extends IStorageFileReference {
  url: string;
}

export const isStorageFileReference = (value: unknown): value is IStorageFileReference =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as IStorageFileReference).key === 'string' &&
  typeof (value as IStorageFileReference).name === 'string';
