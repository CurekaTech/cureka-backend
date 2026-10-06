export const OOS_EMAIL_JOB_NAMES = {
  SEND_PRODUCT_OOS: 'send-product-oos',
  SEND_BUNDLE_OOS: 'send-bundle-oos',
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

export type BundleOosEmailComponent = {
  refId: string;
  name: string;
  variants: Array<{ sku: string; name: string }>;
};

export type BundleOosEmailJobData = {
  bundleRefId: string;
  bundleName: string;
  bundleSku: string;
  reason: string;
  components: BundleOosEmailComponent[];
  occurredAt: string;
};
