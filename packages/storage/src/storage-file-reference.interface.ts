/** Persisted storage reference: object key + bucket name. */
export interface IStorageFileReference {
  key: string;
  name: string;
}

/** API response shape: persisted reference plus a browser-accessible URL. */
export interface IStorageFileReferenceResponse extends IStorageFileReference {
  url: string;
  /** Additive optimized-delivery metadata. Omitted when delivery is disabled. */
  imageDelivery?: IImageDeliveryPayload;
}

export type ImageDeliveryStatus = 'pending' | 'partial' | 'ready' | 'failed' | 'unsupported';

export interface IImageDeliveryOriginal {
  url: string;
  width: number | null;
  height: number | null;
  bytes?: number | null;
  format?: string | null;
}

export interface IImageDeliveryVariant {
  url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export interface IImageDeliveryPayload {
  status: ImageDeliveryStatus;
  original: IImageDeliveryOriginal;
  variants: IImageDeliveryVariant[];
}

export const isStorageFileReference = (value: unknown): value is IStorageFileReference =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as IStorageFileReference).key === 'string' &&
  typeof (value as IStorageFileReference).name === 'string';
