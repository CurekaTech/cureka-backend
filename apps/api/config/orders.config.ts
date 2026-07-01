import { registerAs } from '@nestjs/config';

export const ordersConfig = registerAs('orders', () => ({
  shipping: {
    /** Free shipping when payable amount (subtotal − discount) is at or above this value. */
    freeThreshold: parseFloat(process.env['SHIPPING_FREE_THRESHOLD'] ?? '900'),
    /** Flat shipping fee when payable amount is below the free threshold. */
    flatFee: parseFloat(process.env['SHIPPING_FLAT_FEE'] ?? '50'),
  },
}));
