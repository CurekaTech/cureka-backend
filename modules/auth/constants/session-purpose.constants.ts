/** Long-lived storefront login (HttpOnly user_session). */
export const SESSION_PURPOSE_LOGIN = 'login';

/** Short-lived GoKwik SDK customerToken — Bearer only on /gokwik/* merchant routes. */
export const SESSION_PURPOSE_GOKWIK_CHECKOUT = 'gokwik_checkout';

export type SessionPurpose =
  | typeof SESSION_PURPOSE_LOGIN
  | typeof SESSION_PURPOSE_GOKWIK_CHECKOUT;

/** device_id = `gokwik:<cartUuid>` so cart binding survives without an extra column. */
export const GOKWIK_CHECKOUT_DEVICE_PREFIX = 'gokwik:';

export const GOKWIK_CHECKOUT_DEVICE_NAME = 'GoKwik checkout';

export const parseGokwikCheckoutCartId = (deviceId?: string | null): string | undefined => {
  if (!deviceId?.startsWith(GOKWIK_CHECKOUT_DEVICE_PREFIX)) {
    return undefined;
  }
  const cartId = deviceId.slice(GOKWIK_CHECKOUT_DEVICE_PREFIX.length).trim();
  return cartId || undefined;
};
