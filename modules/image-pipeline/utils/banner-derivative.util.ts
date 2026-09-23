import { IImageDeliveryVariant, ImageDeliveryStatus } from '@packages/storage';

/**
 * Homepage hero target from the existing storefront contract:
 * ~800 CSS px desktop, ~2x a 390px mobile viewport.
 * This only chooses among derivatives that already exist. It does not encode images.
 */
export const BANNER_LCP_TARGET_WIDTH = 800;

export const selectBannerStorefrontVariant = (input: {
  sourceKey: string;
  status: ImageDeliveryStatus;
  sourceWidth: number | null;
  variants: IImageDeliveryVariant[];
}): IImageDeliveryVariant | null => {
  if (!input.sourceKey.startsWith('banners/')) return null;
  if (input.status !== 'ready' && input.status !== 'partial') return null;

  const variants = input.variants
    .filter(
      (variant) =>
        variant.format === 'webp' &&
        variant.width > 0 &&
        isUsableDerivativeUrl(variant.url),
    )
    .sort((left, right) => left.width - right.width);

  if (variants.length === 0) return null;

  const atLeastTarget = variants.find((variant) => variant.width >= BANNER_LCP_TARGET_WIDTH);
  if (atLeastTarget) return atLeastTarget;

  const sourceWidth = input.sourceWidth ?? 0;
  if (sourceWidth > 0 && sourceWidth < BANNER_LCP_TARGET_WIDTH) {
    return variants[variants.length - 1] ?? null;
  }

  return null;
};

const isUsableDerivativeUrl = (url: string): boolean =>
  typeof url === 'string' && url.length > 0 && !url.includes('..') && url.includes('/derivatives/');
