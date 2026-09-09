/**
 * BOB WhatsApp smoke test: POST /abancart
 *
 * Tenant path: {{businessonbot_domain_name}}/abancart
 * Resolved as: ${BOB_NOTIFY_URL}/abancart
 * (docs may say /abandoned-cart — that returns 404 on curekanew)
 *
 * SAFE BY DEFAULT — dry-run unless --send.
 *
 * Offline:
 *   npm run bob:test-abandoned-cart -- --offline --checkout-id=CAR2026330956 --phone=+919974440132
 *   npm run bob:test-abandoned-cart -- --offline ... --send
 *
 * DB:
 *   npm run bob:test-abandoned-cart -- --cart-ref=CAR2026330956 --send
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../app.module';
import { BobNotifyService } from '../../../../modules/bob/services/bob-notify.service';
import { AdminAbandonedCartsService } from '../../../../modules/orders/services/admin-abandoned-carts.service';
import { mapCurekaAbandonedCartToBob } from '../../../../modules/bob/mappers/bob.mapper';
import { toBobE164Phone } from '../../../../modules/bob/utils/bob.util';
import type { BobAbandonedCartPayload } from '../../../../modules/bob/interfaces/bob.interface';

/** BOB abandoned-cart notify path (tenant-confirmed). */
const BOB_ABANDONED_CART_PATH = '/abancart';

interface CliOptions {
  cartRef: string;
  cartId: string;
  offline: boolean;
  send: boolean;
  e164: boolean;
  checkoutId: string;
  recoveryUrl: string;
  phone: string;
  email: string;
  firstName: string;
  lastName: string;
  itemId: string;
  itemName: string;
  imageUrl: string;
  quantity: number;
  price: number;
  totalPrice: number;
  totalDiscount: number;
  address: string;
  city: string;
  province: string;
  zip: string;
  createdAt: string;
  uniqueCheckout: boolean;
}

const DOC_TOP_KEYS = [
  'checkout_id',
  'cart_recovery_url',
  'line_items',
  'customer',
  'order_details',
  'address',
  'phone',
  'created_at',
] as const;

const printUsage = (): void => {
  console.log(`
bob:test-abandoned-cart — POST BOB ${BOB_ABANDONED_CART_PATH}

Docs URL: {{businessonbot_domain_name}}/abancart
Env URL:  \${BOB_NOTIFY_URL}/abancart

Options:
  --cart-ref CAR…       Load abandoned cart by refId (DB)
  --offline             Build payload from CLI flags (no DB)
  --send                Actually POST (default: dry-run)
  --unique-checkout     Append timestamp to checkout_id (BOB often ignores repeat same id)
  --no-e164             Keep raw phone as mapped (default: normalize to +91…)
  --checkout-id --phone --email --first-name --last-name
  --item-id --item-name --image-url --quantity --price
  --total-price --total-discount --recovery-url
  --address --city --province --zip --created-at

Examples:
  npm run bob:test-abandoned-cart -- --cart-ref=CAR2026330956 --send
  npm run bob:test-abandoned-cart -- --cart-ref=CAR2026330956 --unique-checkout --send
  npm run bob:test-abandoned-cart -- --offline --checkout-id=CAR2026330956 --phone=+919974440132 --send
`);
};

const argValue = (argv: string[], i: number, arg: string): { value: string; next: number } => {
  if (arg.includes('=')) {
    return { value: arg.split('=').slice(1).join('='), next: i };
  }
  return { value: argv[i + 1] ?? '', next: i + 1 };
};

const parseCli = (argv: string[]): CliOptions => {
  const opts: CliOptions = {
    cartRef: '',
    cartId: '',
    offline: false,
    send: false,
    e164: true,
    checkoutId: '',
    recoveryUrl: '',
    phone: '',
    email: '',
    firstName: 'Customer',
    lastName: '',
    itemId: 'offline-item',
    itemName: 'Test product',
    imageUrl: '',
    quantity: 1,
    price: 0,
    totalPrice: 0,
    totalDiscount: 0,
    address: 'Test address',
    city: 'Ahmedabad',
    province: 'GUJARAT',
    zip: '380058',
    createdAt: new Date().toISOString(),
    uniqueCheckout: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--send') {
      opts.send = true;
      continue;
    }
    if (arg === '--offline') {
      opts.offline = true;
      continue;
    }
    if (arg === '--unique-checkout') {
      opts.uniqueCheckout = true;
      continue;
    }
    if (arg === '--no-e164') {
      opts.e164 = false;
      continue;
    }

    const stringFlags: Array<[string, keyof CliOptions]> = [
      ['--cart-ref', 'cartRef'],
      ['--cart-id', 'cartId'],
      ['--checkout-id', 'checkoutId'],
      ['--recovery-url', 'recoveryUrl'],
      ['--phone', 'phone'],
      ['--email', 'email'],
      ['--first-name', 'firstName'],
      ['--last-name', 'lastName'],
      ['--item-id', 'itemId'],
      ['--item-name', 'itemName'],
      ['--image-url', 'imageUrl'],
      ['--address', 'address'],
      ['--city', 'city'],
      ['--province', 'province'],
      ['--zip', 'zip'],
      ['--created-at', 'createdAt'],
    ];
    let matched = false;
    for (const [flag, key] of stringFlags) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        const { value, next } = argValue(argv, i, arg);
        opts[key] = value as never;
        i = next;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const numFlags: Array<[string, keyof CliOptions]> = [
      ['--quantity', 'quantity'],
      ['--price', 'price'],
      ['--total-price', 'totalPrice'],
      ['--total-discount', 'totalDiscount'],
    ];
    for (const [flag, key] of numFlags) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        const { value, next } = argValue(argv, i, arg);
        opts[key] = Number(value) as never;
        i = next;
        break;
      }
    }
  }

  return opts;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '(invalid-url)';
  }
};

const mask = (value: string | undefined): string => {
  if (!value) return '(missing)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
};

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 2)}******${digits.slice(-2)}`;
};

const logBanner = (title: string): void => {
  console.log(`\n========== ${title} ==========`);
};

const logJson = (label: string, value: unknown): void => {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(value, null, 2));
};

const buildOfflinePayload = (opts: CliOptions, recoveryUrl: string): BobAbandonedCartPayload => {
  const phone = opts.e164 ? toBobE164Phone(opts.phone) : opts.phone;
  const addr = {
    address: opts.address,
    city: opts.city,
    province: opts.province,
    country: 'India',
    zip: opts.zip,
  };
  return {
    checkout_id: opts.checkoutId,
    cart_recovery_url: opts.recoveryUrl || recoveryUrl,
    line_items: [
      {
        id: opts.itemId,
        name: opts.itemName,
        image: { originalSrc: opts.imageUrl },
        quantity: opts.quantity,
        price: opts.price,
      },
    ],
    customer: {
      email: opts.email,
      first_name: opts.firstName,
      last_name: opts.lastName,
      phone,
    },
    order_details: {
      total_price: opts.totalPrice || opts.price,
      total_tax: 0,
      total_discount: opts.totalDiscount,
      currency: 'INR',
    },
    address: {
      billing_address: addr,
      shipping_address: addr,
    },
    phone,
    created_at: opts.createdAt,
  };
};

const schemaDiff = (payload: BobAbandonedCartPayload): Record<string, unknown> => {
  const keys = Object.keys(payload);
  const missing = DOC_TOP_KEYS.filter((k) => !(k in payload));
  const extra = keys.filter((k) => !(DOC_TOP_KEYS as readonly string[]).includes(k));
  const line = payload.line_items[0];
  const lineKeys = line ? Object.keys(line) : [];
  const expectedLine = ['id', 'name', 'image', 'quantity', 'price'];
  const expectedCustomer = ['email', 'first_name', 'last_name', 'phone'];
  const expectedOrder = ['total_price', 'total_tax', 'total_discount', 'currency'];
  const expectedAddr = ['address', 'city', 'province', 'country', 'zip'];
  return {
    docsPath: `POST {{businessonbot_domain_name}}${BOB_ABANDONED_CART_PATH}`,
    topLevel: {
      docsCount: DOC_TOP_KEYS.length,
      oursCount: keys.length,
      oursKeys: keys,
      missingVsDocs: missing,
      extraVsDocs: extra,
      allKeysMatch: missing.length === 0 && extra.length === 0,
    },
    lineItem0: {
      keys: lineKeys,
      missing: expectedLine.filter((k) => !lineKeys.includes(k)),
      extra: lineKeys.filter((k) => !expectedLine.includes(k)),
      imageKeys: line?.image ? Object.keys(line.image) : [],
      quantityType: typeof line?.quantity,
      priceType: typeof line?.price,
    },
    customer: {
      keys: Object.keys(payload.customer),
      missing: expectedCustomer.filter((k) => !(k in payload.customer)),
      optionalOmitted: ['orders_count', 'total_spent', 'last_order_id'].filter(
        (k) => !(k in payload.customer),
      ),
    },
    order_details: {
      keys: Object.keys(payload.order_details),
      missing: expectedOrder.filter((k) => !(k in payload.order_details)),
    },
    address: {
      keys: Object.keys(payload.address),
      billingKeys: Object.keys(payload.address.billing_address),
      shippingKeys: Object.keys(payload.address.shipping_address),
      billingMissing: expectedAddr.filter(
        (k) => !(k in payload.address.billing_address),
      ),
      shippingMissing: expectedAddr.filter(
        (k) => !(k in payload.address.shipping_address),
      ),
    },
  };
};

async function main(): Promise<void> {
  const logger = new Logger('bob:test-abandoned-cart');
  const opts = parseCli(process.argv.slice(2));

  if (!opts.offline && !opts.cartRef.trim() && !opts.cartId.trim()) {
    printUsage();
    process.exit(1);
  }
  if (opts.offline && !opts.checkoutId.trim()) {
    logger.error('--offline requires --checkout-id');
    process.exit(1);
  }
  if (opts.offline && !opts.phone.trim()) {
    logger.error('--offline requires --phone');
    process.exit(1);
  }

  const bobNotifyUrl = (process.env['BOB_NOTIFY_URL'] ?? '').trim();
  const bobGuestId = (process.env['BOB_GUEST_ID'] ?? '').trim();
  const endpoint = `${bobNotifyUrl.replace(/\/$/, '')}${BOB_ABANDONED_CART_PATH}`;

  logBanner('BOB ABANDONED-CART TEST — START');
  logJson('config', {
    method: 'POST',
    docsPath: `{{businessonbot_domain_name}}${BOB_ABANDONED_CART_PATH}`,
    resolvedPath: BOB_ABANDONED_CART_PATH,
    bobNotifyUrl: bobNotifyUrl || '(unset)',
    bobNotifyHost: bobNotifyUrl ? hostOf(bobNotifyUrl) : '(unset)',
    endpoint,
    bobGuestId: mask(bobGuestId),
    authHeaders: ['content-type', 'x-guest-id', 'x-api-key', 'X-API-Key', 'Idempotency-Key'],
    dryRun: !opts.send,
    offline: opts.offline,
    e164: opts.e164,
    uniqueCheckout: opts.uniqueCheckout,
    cartRef: opts.cartRef || null,
    cartId: opts.cartId || null,
    checkoutId: opts.checkoutId || null,
    note: 'WhatsApp is sent by BOB after API accept — Cureka only POSTs Notifications API',
  });

  if (!bobNotifyUrl || !bobGuestId) {
    logger.error('BOB_NOTIFY_URL and BOB_GUEST_ID must be set');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  let exitCode = 0;
  try {
    const bobNotify = app.get(BobNotifyService);
    const config = app.get(ConfigService);
    const storefront =
      config.get<string>('STOREFRONT_URL')?.replace(/\/+$/, '') ||
      process.env['STOREFRONT_URL']?.replace(/\/+$/, '') ||
      '';
    const recoveryBase = storefront || 'https://www.cureka.com';
    const recoveryUrl = `${recoveryBase}/cart`;

    logger.log({ recoveryBase, recoveryUrl }, 'Cart recovery URL resolved');

    let payload: BobAbandonedCartPayload;
    let meta: Record<string, unknown>;

    if (opts.offline) {
      logger.log('Building offline payload from CLI flags');
      payload = buildOfflinePayload(opts, recoveryUrl);
      meta = {
        mode: 'offline',
        checkoutId: opts.checkoutId,
        phoneMasked: maskPhone(payload.phone),
      };
    } else {
      const abandoned = app.get(AdminAbandonedCartsService);
      const ref = opts.cartRef.trim() || opts.cartId.trim();
      logger.log({ ref }, 'Loading abandoned cart from DB');
      const detail = await abandoned.findOne(ref);
      logger.log(
        {
          id: detail.id,
          refId: detail.refId,
          itemCount: detail.cart.items?.length ?? 0,
          grandTotal: detail.cart.grandTotal,
          lastActivityAt: detail.lastActivityAt,
        },
        'Abandoned cart loaded',
      );
      payload = mapCurekaAbandonedCartToBob({
        detail,
        recoveryUrl,
        storefrontUrl: recoveryBase,
      });
      if (opts.e164) {
        const before = payload.phone;
        const phone = toBobE164Phone(payload.phone);
        payload = {
          ...payload,
          phone,
          customer: { ...payload.customer, phone },
        };
        logger.log(
          { beforeMasked: maskPhone(before), afterMasked: maskPhone(phone) },
          'Normalized phone to E.164',
        );
      }
      meta = {
        mode: 'db',
        id: detail.id,
        refId: detail.refId,
        phoneMasked: maskPhone(payload.phone),
        itemCount: detail.cart.items?.length ?? 0,
      };
    }

    const originalCheckoutId = payload.checkout_id;
    if (opts.uniqueCheckout) {
      const uniqueId = `${originalCheckoutId}-T${Date.now()}`;
      payload = { ...payload, checkout_id: uniqueId };
      logger.warn(
        { originalCheckoutId, uniqueCheckoutId: uniqueId },
        'Rewrote checkout_id so BOB treats this as a new abandoned-cart event',
      );
    } else {
      logger.warn(
        {
          checkout_id: originalCheckoutId,
          tip: 'BOB often suppresses repeat posts with the same checkout_id (still HTTP 200). Use --unique-checkout to force a new dashboard entry.',
        },
        'Same checkout_id may not appear again on BOB dashboard',
      );
    }

    const idempotencyKey = `abandoned-cart:test:${payload.checkout_id}:${Date.now()}`;
    const diff = schemaDiff(payload);

    logBanner('REQUEST PREVIEW');
    logJson('meta', {
      ...meta,
      originalCheckoutId,
      checkoutIdSent: payload.checkout_id,
      uniqueCheckout: opts.uniqueCheckout,
      bobDedupeNote:
        'BOB commonly dedupes by checkout_id; Idempotency-Key alone may not create a second dashboard row',
    });
    logJson('schemaDiff_vs_docs', diff);
    logJson('http_request', {
      method: 'POST',
      url: endpoint,
      path: BOB_ABANDONED_CART_PATH,
      headers: {
        'content-type': 'application/json',
        'x-guest-id': mask(bobGuestId),
        'x-api-key': mask(bobGuestId),
        'X-API-Key': mask(bobGuestId),
        'Idempotency-Key': idempotencyKey,
      },
      payloadKeyCount: Object.keys(payload).length,
      lineItemCount: payload.line_items.length,
    });
    logJson('payload', payload);

    if (!opts.send) {
      logBanner('DRY-RUN COMPLETE');
      console.log('Re-run with --send to POST the request above.');
      logger.log('Dry-run complete — no HTTP call made');
      return;
    }

    logBanner(`POST ${endpoint}`);
    logger.log(
      {
        method: 'POST',
        url: endpoint,
        path: BOB_ABANDONED_CART_PATH,
        idempotencyKey,
        checkoutId: payload.checkout_id,
        phoneMasked: maskPhone(payload.phone),
        lineItemCount: payload.line_items.length,
        totalPrice: payload.order_details.total_price,
      },
      'Sending abandoned-cart to BOB',
    );

    const started = Date.now();
    const result = await bobNotify.post(BOB_ABANDONED_CART_PATH, payload, {
      idempotencyKey,
    });
    const elapsedMs = Date.now() - started;

    logBanner('RESPONSE');
    logJson('http_response', {
      method: 'POST',
      url: endpoint,
      path: BOB_ABANDONED_CART_PATH,
      elapsedMs,
      accepted: result.accepted,
      httpStatus: result.httpStatus,
      error: result.error ?? null,
      expectedSuccessBody: { status: 'success', statusCode: 200 },
      note404:
        result.httpStatus === 404
          ? 'BOB returned path not found — confirm /abancart is enabled on this BOB_NOTIFY_URL tenant'
          : null,
    });

    if (!result.accepted) {
      exitCode = 2;
      logger.error(
        { ...result, elapsedMs, endpoint },
        `BOB rejected ${BOB_ABANDONED_CART_PATH}`,
      );
      logBanner('RESULT: REJECTED');
      console.log('Check BOB dashboard / ask BOB to enable this path on the tenant.');
      return;
    }

    logger.log(
      { ...result, elapsedMs, endpoint },
      `BOB accepted ${BOB_ABANDONED_CART_PATH}`,
    );
    logBanner('RESULT: ACCEPTED');
    console.log(
      JSON.stringify(
        {
          next: [
            'Search BOB abandoned-cart dashboard for the exact checkout_id sent (unique -T… suffix)',
            'Confirm WhatsApp on the phone within a few minutes',
            'If empty: BOB dashboard → Notifications logs for that checkout_id',
            'Send hello to Cureka WhatsApp number to confirm opt-in',
          ],
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    logBanner('BOB ABANDONED-CART TEST — END');
    // Nest workers (sitemap/redis) can keep the process alive after close.
    process.exit(exitCode);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
