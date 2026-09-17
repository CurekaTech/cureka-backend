export const OOS_EMAIL_JOB_NAMES = {
  SEND_PRODUCT_OOS: 'send-product-oos',
} as const;

export type OosEmailJobData = {
  variantId: string;
  productId: string;
  sku: string;
  stock: number;
  productName?: string | null;
  variantDisplayName?: string | null;
  occurredAt: string;
};
