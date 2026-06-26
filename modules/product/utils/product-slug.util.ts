import { generateSlug } from '@packages/common/pagination.util';
import { APP_CONSTANTS } from '@packages/common';
import { BadRequestException } from '@nestjs/common';

export const generateProductSlug = (name: string): string =>
  generateSlug(name)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH);

export const generateTagSlug = (name: string): string => generateProductSlug(name);

export const assertProductUrlSlugLength = (
  slug: string,
  context: 'Product' | 'Variant' = 'Product',
): void => {
  const max = APP_CONSTANTS.PRODUCT_URL_SLUG_MAX_LENGTH;
  if (slug.length > max) {
    throw new BadRequestException(
      `${context} slug must not exceed ${max} characters (received ${slug.length}). Use a shorter name or provide a shorter custom slug.`,
    );
  }
};
