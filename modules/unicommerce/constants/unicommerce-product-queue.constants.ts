export const UNICOMMERCE_PRODUCT_JOB_NAMES = {
  PUSH_PRODUCT: 'push-product-to-unicommerce',
} as const;

export interface PushProductToUnicommerceJobData {
  productRefId: string;
}
