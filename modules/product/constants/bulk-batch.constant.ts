/** Default batch size for bulk export DB reads and bulk upload row processing. */
export const PRODUCT_BULK_BATCH_SIZE = 500;

export const resolveProductBulkBatchSize = (
  configValue: number | string | undefined,
): number => {
  const parsed = Number(configValue);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return PRODUCT_BULK_BATCH_SIZE;
};
