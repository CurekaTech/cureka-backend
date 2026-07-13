import { BadRequestException } from '@nestjs/common';
import { imageSize } from 'image-size';
import {
  BLOG_FEATURED_IMAGE_ASPECT_LABEL,
  BLOG_FEATURED_IMAGE_ASPECT_RATIO,
  BLOG_FEATURED_IMAGE_ASPECT_TOLERANCE,
  BLOG_FEATURED_IMAGE_DIMENSIONS_LABEL,
  BLOG_FEATURED_IMAGE_MIN_HEIGHT,
  BLOG_FEATURED_IMAGE_MIN_WIDTH,
} from '../constants/blog-featured-image.constants';

export function validateBlogFeaturedImageBuffer(buffer: Buffer): void {
  const dimensions = imageSize(buffer);
  const width = dimensions.width ?? 0;
  const height = dimensions.height ?? 0;

  if (!width || !height) {
    throw new BadRequestException('Unable to read blog banner image dimensions.');
  }

  if (width < BLOG_FEATURED_IMAGE_MIN_WIDTH || height < BLOG_FEATURED_IMAGE_MIN_HEIGHT) {
    throw new BadRequestException(
      `Blog banner must be at least ${BLOG_FEATURED_IMAGE_MIN_WIDTH}×${BLOG_FEATURED_IMAGE_MIN_HEIGHT}px. Uploaded: ${width}×${height}px.`,
    );
  }

  const ratio = width / height;
  const ratioDiff = Math.abs(ratio - BLOG_FEATURED_IMAGE_ASPECT_RATIO);
  if (ratioDiff > BLOG_FEATURED_IMAGE_ASPECT_TOLERANCE) {
    throw new BadRequestException(
      `Blog banner must use a ${BLOG_FEATURED_IMAGE_ASPECT_LABEL} aspect ratio (recommended ${BLOG_FEATURED_IMAGE_DIMENSIONS_LABEL}). Uploaded: ${width}×${height}px.`,
    );
  }
}
