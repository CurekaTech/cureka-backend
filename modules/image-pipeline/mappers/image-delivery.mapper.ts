import {
  IImageDeliveryOriginal,
  IImageDeliveryPayload,
  IImageDeliveryVariant,
  ImageDeliveryStatus,
} from '@packages/storage';
import { ImageAssetStatus } from '../enums/image-asset-status.enum';
import { IImageAssetView, IImageVariantRecord } from '../interfaces/image-pipeline.interface';

const toPublicStatus = (status: ImageAssetStatus): ImageDeliveryStatus => {
  switch (status) {
    case ImageAssetStatus.READY:
      return 'ready';
    case ImageAssetStatus.PARTIAL:
      return 'partial';
    case ImageAssetStatus.FAILED:
      return 'failed';
    case ImageAssetStatus.UNSUPPORTED:
      return 'unsupported';
    default:
      return 'pending';
  }
};

export const mapAssetToDelivery = (input: {
  asset: IImageAssetView | null;
  originalUrl: string;
  variantUrls: Map<string, string>;
}): IImageDeliveryPayload => {
  const original: IImageDeliveryOriginal = {
    url: input.originalUrl,
    width: input.asset?.sourceWidth ?? null,
    height: input.asset?.sourceHeight ?? null,
    bytes: input.asset?.sourceBytes ?? null,
    format: input.asset?.sourceMime ?? null,
  };

  if (!input.asset) {
    return {
      status: 'pending',
      original,
      variants: [],
    };
  }

  const variants: IImageDeliveryVariant[] = [];
  for (const variant of input.asset.variants) {
    const url = input.variantUrls.get(variant.key);
    if (!url) continue;
    variants.push(mapVariant(variant, url));
  }

  let status = toPublicStatus(input.asset.status);
  if (variants.length > 0 && (status === 'pending' || status === 'failed')) {
    status = 'partial';
  }

  return {
    status,
    original,
    variants,
  };
};

const mapVariant = (variant: IImageVariantRecord, url: string): IImageDeliveryVariant => ({
  url,
  width: variant.width,
  height: variant.height,
  format: variant.format,
  bytes: variant.bytes,
});
