/**
 * Cashfree Subscriptions (x-api-version 2022-09-01 / 2023-08-01 / 2025-01-01)
 * address GET/POST /pg/subscriptions/{subscription_id} with the merchant
 * `subscription_id` (we send `sub_<uuid>`). `cf_subscription_id` is Cashfree's
 * numeric reference and is not a valid path id — using it returns HTTP 400
 * "Subscription does not exist for given subReferenceId".
 */

export function isCashfreeMerchantSubscriptionId(value?: string | null): boolean {
  const id = value?.trim() ?? '';
  return id.startsWith('sub_');
}

export function isCashfreeNumericReferenceId(value?: string | null): boolean {
  const id = value?.trim() ?? '';
  return /^\d+$/.test(id);
}

export function resolveCashfreeMerchantSubscriptionId(
  ...ids: Array<string | null | undefined>
): string | undefined {
  const values = ids.map((id) => id?.trim() ?? '').filter((id) => id.length > 0);
  return values.find((id) => isCashfreeMerchantSubscriptionId(id)) ?? values.find((id) => !isCashfreeNumericReferenceId(id));
}

export function resolveCashfreeNumericReferenceId(
  ...ids: Array<string | null | undefined>
): string | undefined {
  const values = ids.map((id) => id?.trim() ?? '').filter((id) => id.length > 0);
  return values.find((id) => isCashfreeNumericReferenceId(id));
}
