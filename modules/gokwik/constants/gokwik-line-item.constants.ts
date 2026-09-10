/** Legacy GoKwik source for auto-added complimentary products when a coupon grants a free item. */
export const GOKWIK_COMPLIMENTARY_LINE_SOURCE = 'GK-Discount-Auto-Add';

/**
 * Free / complimentary line detection (create-order + place-order):
 * 1. `is_freebie === true` (current GoKwik marker)
 * 2. `source === GOKWIK_COMPLIMENTARY_LINE_SOURCE` (legacy)
 * 3. `price === 0` (observed freebie payload when source stays merchant, e.g. "cureka")
 */
