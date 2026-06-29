export const APP_CONSTANTS = {
  API_PREFIX: 'api/v1',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  /** Fastify route param limit; must be >= DB slug column max (500). */
  FASTIFY_MAX_PARAM_LENGTH: 512,
  /** User-facing max length for product and variant URL slugs. */
  PRODUCT_URL_SLUG_MAX_LENGTH: 200,
  /** Max file parts per multipart request (product media + variant images + size chart). */
  DEFAULT_MAX_MULTIPART_FILES: 50,
} as const;
