import { ImageAssetStatus } from '../enums/image-asset-status.enum';

export interface IImageVariantRecord {
  width: number;
  height: number;
  format: 'webp';
  bytes: number;
  key: string;
}

export interface IImageProcessJobData {
  sourceBucket: string;
  sourceKey: string;
  processToken: string;
  pipelineVersion: string;
}

export interface IImageSourceIdentity {
  bucket: string;
  key: string;
}

export interface IImageInspectResult {
  mime: string;
  format: string;
  width: number;
  height: number;
  animated: boolean;
  hasAlpha: boolean;
  unsupportedReason?: string;
}

export interface IImageEncodeResult {
  requestedWidth: number;
  width: number;
  height: number;
  format: 'webp';
  bytes: number;
  buffer: Buffer;
}

export interface IImageBackfillCounts {
  scanned: number;
  eligible: number;
  alreadyComplete: number;
  queued: number;
  unsupported: number;
  missingSource: number;
  failed: number;
  skippedDuplicate: number;
}

export interface IImageAssetView {
  status: ImageAssetStatus;
  sourceBucket: string;
  sourceKey: string;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceMime: string | null;
  sourceBytes: number | null;
  pipelineVersion: string;
  variants: IImageVariantRecord[];
  errorCode: string | null;
}
