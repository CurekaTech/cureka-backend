import { generateSlug } from '@packages/common/pagination.util';

export const generateProductSlug = (name: string): string =>
  generateSlug(name)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 480);

export const generateTagSlug = (name: string): string => generateProductSlug(name);
