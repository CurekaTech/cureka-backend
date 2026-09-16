import { Injectable } from '@nestjs/common';
import type { Metadata as SharpMetadata } from 'sharp';
import { detectRasterMagic, looksLikePdf, looksLikeSvg } from '../utils/image-bytes.util';
import { selectOutputWidth } from '../utils/derivative-key.util';
import { IImageEncodeResult, IImageInspectResult } from '../interfaces/image-pipeline.interface';

// Jest/CJS interop: sharp's default export is the callable factory.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp');

export class ImageProcessingError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

@Injectable()
export class ImageProcessorService {
  async inspect(buffer: Buffer, maxDecodedPixels: number): Promise<IImageInspectResult> {
    if (looksLikeSvg(buffer)) {
      return {
        mime: 'image/svg+xml',
        format: 'svg',
        width: 0,
        height: 0,
        animated: false,
        hasAlpha: true,
        unsupportedReason: 'svg',
      };
    }
    if (looksLikePdf(buffer)) {
      return {
        mime: 'application/pdf',
        format: 'pdf',
        width: 0,
        height: 0,
        animated: false,
        hasAlpha: false,
        unsupportedReason: 'pdf',
      };
    }

    const magic = detectRasterMagic(buffer);
    if (!magic) {
      throw new ImageProcessingError('Unsupported or corrupt image content', 'unsupported', true);
    }

    let metadata: SharpMetadata;
    try {
      metadata = await sharp(buffer, {
        failOn: 'error',
        limitInputPixels: maxDecodedPixels,
        animated: true,
      }).metadata();
    } catch (error) {
      throw new ImageProcessingError(
        error instanceof Error ? error.message : 'Corrupt image',
        'corrupt',
        true,
      );
    }

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    const pages = metadata.pages ?? 1;
    const animated = pages > 1 || Boolean(metadata.delay && metadata.delay.length > 1);
    const pixels = width * height * Math.max(pages, 1);

    if (pixels > maxDecodedPixels) {
      throw new ImageProcessingError('Image exceeds decoded pixel limit', 'too_large', true);
    }

    if (animated) {
      return {
        mime: magic,
        format: metadata.format ?? 'unknown',
        width,
        height,
        animated: true,
        hasAlpha: Boolean(metadata.hasAlpha),
        unsupportedReason: 'animated',
      };
    }

    return {
      mime: magic,
      format: metadata.format ?? 'unknown',
      width,
      height,
      animated: false,
      hasAlpha: Boolean(metadata.hasAlpha),
    };
  }

  async encodeWebp(input: {
    buffer: Buffer;
    requestedWidth: number;
    quality: number;
    timeoutMs: number;
    maxDecodedPixels: number;
  }): Promise<IImageEncodeResult> {
    return this.withTimeout(input.timeoutMs, async () => {
      const image = sharp(input.buffer, {
        failOn: 'error',
        limitInputPixels: input.maxDecodedPixels,
        sequentialRead: true,
        animated: false,
      }).rotate();

      const metadata = await image.metadata();
      const sourceWidth = metadata.width ?? 0;
      const sourceHeight = metadata.height ?? 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new ImageProcessingError('Image has no dimensions', 'corrupt', true);
      }

      const outputWidth = selectOutputWidth(sourceWidth, input.requestedWidth);
      const resized = image.resize({
        width: outputWidth,
        withoutEnlargement: true,
        fit: 'inside',
      });

      const encoded = await resized
        .webp({
          quality: input.quality,
          alphaQuality: input.quality,
          effort: 4,
        })
        .toBuffer({ resolveWithObject: true });

      return {
        requestedWidth: input.requestedWidth,
        width: encoded.info.width,
        height: encoded.info.height,
        format: 'webp',
        bytes: encoded.data.length,
        buffer: encoded.data,
      };
    });
  }

  private async withTimeout<T>(timeoutMs: number, work: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new ImageProcessingError('Image processing timed out', 'timeout', false));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
